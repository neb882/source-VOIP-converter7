'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { createStaticServer } = require('./static-server');
const { siteFiles } = require('./lib/site-files.cjs');

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

// A stereo file whose channels differ: wavSpeech's talk on the left, a
// gated 700 Hz tone on the right (W4-01b: the capture channel).
function wavStereo(seconds, rate = 48000) {
  const mono = wavSpeech(seconds, rate), length = Math.round(seconds * rate), buffer = Buffer.alloc(44 + length * 4);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 4, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 4, 40);
  for (let i = 0; i < length; i++) {
    buffer.writeInt16LE(mono.readInt16LE(44 + i * 2), 44 + i * 4);
    const t = i / rate, on = Math.floor(t / 0.5) % 2 === 0;
    buffer.writeInt16LE(Math.round((on ? 0.3 : 0) * Math.sin(2 * Math.PI * 700 * t) * 0x7fff), 44 + i * 4 + 2);
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

// W4-01a: a source renders by itself, and a changed setting renders by itself
// 400 ms after the last change (a source of a minute or less). These wait for
// that: the source on the page has its render on screen, and no render is
// running or waiting to start.
const waitRendered = (page, timeout = 60000) => page.waitForFunction(
  () => !!state.decodedSource && state.renderedSource === state.decodedSource && renderIdle(), null, { timeout });
// Choose a file in step 1 and wait for its own render.
async function chooseFile(page, file, timeout = 60000) {
  await page.evaluate(() => { window.__sourceBefore = state.decodedSource; });
  await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(() => !!state.decodedSource && state.decodedSource !== window.__sourceBefore
    && state.renderedSource === state.decodedSource && renderIdle(), null, { timeout });
}
// Press Render (no render running or waiting first) and wait for its result.
async function renderNow(page, timeout = 60000) {
  await page.waitForFunction(() => !state.processing, null, { timeout });
  const before = await page.evaluate(() => state.renderId);
  await page.locator('#process').click();
  await page.waitForFunction((id) => state.renderId > id && renderIdle(), before, { timeout });
}
// The render's status line under the player.
const renderStatus = (page) => page.locator('#render-status').textContent();

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
      // On the file's own timing (W3-02d-1): on the game's voice queue a tone
      // that opens the channel has short pieces cut out of its first seconds,
      // and the count of zero crossings below reads a broken cycle as a change
      // of pitch. The pitch itself does not move ([Browser 8c] measures it on
      // the queue by the median length of a cycle); this checks the rates.
      await page.evaluate(() => execCommand('voice_timeline source'));
      for (const fileRate of [44100, 48000]) {
        const label = `${fileRate} Hz file -> ${decodeRate} Hz browser`;
        // The file renders by itself (W4-01a).
        await chooseFile(page, { name: `tone-${fileRate}.wav`, mimeType: 'audio/wav', buffer: wavTone(.5, fileRate) });
        const source = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
        check(await deviceRateOf(page) === decodeRate && source.rate === fileRate,
          `${label}: the device runs at ${decodeRate} Hz and the file is decoded at its own rate`, `${source.rate} Hz`);
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
    // On the file's own timing (W3-02d-1), as in [Browser 3] and [Browser 5]:
    // on the game's voice queue a tone that opens the channel has short pieces
    // cut out of its first seconds, which the count of zero crossings below
    // reads as a change of pitch; the pitch does not move ([Browser 8c]).
    await page.evaluate(() => execCommand('voice_timeline source'));
    const rendered = [];
    for (const rate of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000]) {
      await load({ name: `render-${rate}.wav`, mimeType: 'audio/wav', buffer: wavTone(.5, rate) });
      await waitRendered(page);
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
    await waitRendered(page);
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
  // W4-01a: the rows are named RENDER and ORIGINAL (no element says wet or
  // dry; the owner, 2026-11-11: one neutral name for the render).
  check(meter[0][0] === 'RENDER' && meter[1][0] === 'ORIGINAL' && Number.isFinite(lufs(meter[0])) && Number.isFinite(lufs(meter[1])),
    'meter lists integrated loudness for the render (RENDER) and the source (ORIGINAL)', `${meter[0][1]} / ${meter[1][1]} LUFS`);
  await page.locator('#ab-match').click();
  const matched = await page.locator('#ab-match').textContent();
  const gains = await page.evaluate(() => ({ louder: state.abLouder, offset: state.abOffsetDb }));
  check(/^Matched: the (render|original) −?\d+\.\d dB$/.test(matched) && gains.offset <= 0
    && Math.abs(Math.abs(gains.offset) - Math.abs(lufs(meter[0]) - lufs(meter[1]))) < 0.11,
    'loudness matching lowers the louder version by the LUFS difference', matched);
  await page.locator('#ab-match').click();
  await page.locator('h1').click();
  const hearing = () => page.evaluate(() => ({ mode: state.abMode, pressed: document.querySelector('#ab-group [aria-pressed="true"]').dataset.ab,
    now: document.getElementById('ab-now').textContent }));
  const before = await hearing();
  await page.keyboard.press('b');
  const after = await hearing();
  check(before.mode === 'wet' && after.mode === 'dry' && after.pressed === 'dry' && after.now === 'Hearing the original',
    'the B key switches Hear from the render to the original', JSON.stringify(after));
  // With the player focused (as after a first render), B switches too.
  await page.locator('#preview').focus();
  await page.keyboard.press('b');
  check((await hearing()).mode === 'wet', 'and with the player focused, back to the render');
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
  await chooseFile(page, { name: 'speech.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) });
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
  // The meter's "Δ real" row comes once the take's own meter job (a worker's)
  // has answered, after the report's table: wait for it, and let the check
  // below say so if it never comes.
  await page.waitForFunction(() => [...document.querySelectorAll('#meter-rows tr th')].some((th) => th.textContent === 'Δ real'),
    null, { timeout: 60000 }).catch(() => {});
  const take = await page.evaluate(() => ({ segments: state.realTake.timeline.segments.length,
    delay: state.realTake.timeline.segments[0].a, ppm: state.realTake.timeline.segments[0].clockPpm,
    status: document.getElementById('reference-status').textContent,
    bands: [...document.querySelectorAll('#reference-report tbody td')].map(td => td.textContent),
    rows: [...document.querySelectorAll('#meter-rows tr th')].map(th => th.textContent) }));
  check(take.segments === 1 && Math.abs(take.delay - .4321) < .001 && Math.abs(take.ppm - 100) < 10,
    'a real take is found in the source and lined up (delay and clock)', `${take.segments} segment, ${(take.delay * 1000).toFixed(2)} ms, ${take.ppm.toFixed(1)} ppm; ${take.status}`);
  const within = take.bands.slice(0, 13).map(t => Math.abs(Number(t.replace('−', '-'))));
  check(within.every(d => d <= .3), 'the report finds the take and the render alike, band by band up to 12 kHz', take.bands.join(' '));
  check(take.rows.includes('REAL') && take.rows.includes('Δ real'), 'the meter adds the real take and the render minus the real take');
  // Hear gains "Real take" once a take is loaded; B cycles to it.
  check(!(await page.locator('#ab-group [data-ab="real"]').isHidden()), 'Hear offers "Real take" once a take is loaded');
  await page.locator('h1').click();
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  check(await page.locator('#ab-group [data-ab="real"]').getAttribute('aria-pressed') === 'true' && await page.evaluate(() => audibleBuffer().label) === 'REAL',
    'B cycles Hear to the real take');
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('avg:real'), null, { timeout: 60000 });
  check(true, 'AVG compares the render with the real take once one is loaded');
  await page.locator('#reference-clear').click();
  check(await page.evaluate(() => !state.realTake && state.abMode === 'wet') && await page.locator('#ab-group [data-ab="wet"]').getAttribute('aria-pressed') === 'true'
    && await page.locator('#ab-group [data-ab="real"]').isHidden()
    && !(await page.evaluate(() => [...document.querySelectorAll('#meter-rows tr th')].some(th => th.textContent === 'REAL'))),
    'removing the take returns Hear to the render and the original, and the meter to two rows');
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
    // It renders by itself (W4-01a), and then offers the video download.
    await chooseFile(page, file);
    await page.waitForFunction(() => !document.getElementById('download-video').disabled);
    const shown = await page.evaluate(() => ({ hidden: document.getElementById('download-video').hidden,
      disabled: document.getElementById('download-video').disabled, label: document.getElementById('download-video').textContent }));
    check(!shown.hidden && !shown.disabled, `${name}: a video source renders by itself and then offers the video download`, shown.label);
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
    && /rendered through TF2's receiver alone/.test(loaded.status),
    'a demo loads the first speaker\'s voice as the source, at 24 kHz, with the Steam codec', `${loaded.name}, ${loaded.seconds.toFixed(2)} s`);
  check(loaded.shown && loaded.speakers.length === 2, 'with two speakers, a select picks whose voice to take', loaded.speakers.join(', '));
  await page.locator('#demo-speaker').selectOption('4503603922337794');
  await page.waitForFunction(() => state.sourceDemo && state.sourceDemo.speaker.id === '4503603922337794' && !document.getElementById('process').disabled);
  await page.locator('#demo-speaker').selectOption('4503603922337793');
  await page.waitForFunction(() => state.sourceDemo && state.sourceDemo.speaker.id === '4503603922337793' && !document.getElementById('process').disabled);
  check(true, 'switching speakers reloads the voice from the same demo');
  // The demo's voice renders by itself, through the receiver only.
  await waitRendered(page);
  const info = await page.evaluate(() => ({ backend: state.lastCodecInfo.backend, frames: state.lastCodecInfo.frames, lost: state.lastCodecInfo.lostFrames,
    dtx: state.lastCodecInfo.dtxFrames, log: [...document.querySelectorAll('#console-log .line, #console-log div')].map(e => e.textContent).join('\n') }));
  check(info.backend === 'demo' && info.frames === 160 && info.lost === 1 && info.dtx === 1,
    'the render runs the receiver only, and the codec lane shows the demo\'s own frames', `${info.frames} frames, ${info.lost} lost, ${info.dtx} DTX`);
  // W4-01a: a demo's codec in the render's status line is the demo's own.
  const demoStatus = await renderStatus(page);
  check(/^Rendered in \d+\.\d s · 3\.\d s of sound at [\d,]+ Hz · Steam voice, as the demo carries it/.test(demoStatus),
    'the render\'s status line names the codec the demo carries', demoStatus);
  // A demo's frames without a packet are not only the gate's (review, N1).
  check(/ · \d+\.\d\d s with no voice packets$/.test(demoStatus) && !/gate/.test(demoStatus),
    'for a demo, the line gives the time with no voice packets, not the gate\'s reason', demoStatus);
  // The sender's settings, which a demo's render does not read, do not
  // render it again; a receiver's setting does (review, N2).
  {
    const mark = 'test: the demo\'s settings';
    await page.evaluate((m) => logLine(m, 'sys'), mark);
    await page.evaluate(() => { execCommand('voice_micgain 2'); execCommand('dsp_hpf 300'); execCommand('net_fakeloss 20'); });
    await page.waitForTimeout(1000);
    const sender = await page.evaluate(() => ({ processing: state.processing, stale: state.stale }));
    const started = await rendersStartedSince(page, mark);
    await page.evaluate(() => { execCommand('voice_micgain 1'); execCommand('dsp_hpf 0'); execCommand('net_fakeloss 0'); execCommand('voice_scale 0.5'); });
    await waitRendered(page);
    const receiver = await rendersStartedSince(page, mark);
    await page.evaluate(() => execCommand('voice_scale 1'));
    await waitRendered(page);
    check(started === 0 && !sender.processing && !sender.stale && receiver === 1,
      'with a demo as the source, the sender\'s settings (mic gain, a filter, loss) start no render and mark nothing; voice_scale renders it again',
      `${started} then ${receiver} render${receiver === 1 ? '' : 's'} started`);
  }
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
  const render = () => renderNow(page);
  await page.locator('#viz-wave').click();
  await page.locator('#codec').selectOption('speex');
  const consoleBefore = (await page.locator('#console-out').textContent()).length;
  await render();
  await page.waitForFunction(() => [...document.querySelectorAll('#viz-legend .lg-item')].some(e => e.querySelector('.lg-box')));
  const seen = await page.evaluate((from) => {
    const items = [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box'));
    const chain = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec');
    return { legend: items.map(e => e.textContent), legendTitles: items.map(e => e.title || e.querySelector('[title]')?.title || ''),
      console: document.getElementById('console-out').textContent.slice(from), status: document.getElementById('render-status').textContent,
      chain: chain ? chain.textContent : '', option: document.getElementById('codec').selectedOptions[0].textContent,
      frames: state.lastCodecInfo.frames, color: FRAME_STYLE[7].color };
  }, consoleBefore);
  const sVoice = seen.console.split('\n').filter(l => l.includes('S_Voice')).join(' | ') || seen.console.slice(0, 300);
  check(seen.legend.length === 1 && seen.legend[0] === `Speex ${seen.frames}`, 'a speex render\'s codec lane counts every frame as Speex', seen.legend.join(', '));
  check(/S_Voice: Speex 1\.0\.2, 11\.025 kbps CBR, 20-byte packets of 14\.5 ms, a lost frame plays as zeros \(Speex 100%\)/.test(seen.console),
    'the console line names Speex 1.0.2, its frames, and zeros for a lost frame', sVoice);
  // W4-01a: the render's status line names the codec by the codec menu's words.
  check(/^Rendered in \d+\.\d s · .* · vaudio_speex \(Speex, 11 kHz\)/.test(seen.status), 'the render\'s status line names vaudio_speex', seen.status);
  const words = 'Speex 1.0.2 on 11.025 kHz sound · 20-byte frames of 14.51 ms · 11.025 kbit/s';
  // W4-01d: the menu's entry is the plain name with its figures shortened
  // (it fits a 390 px screen); the chain strip keeps the module's figures.
  check(seen.chain === `Codec${words}` && seen.option === 'vaudio_speex (Speex, 11 kHz)', 'the chain strip describes the game\'s Speex module, and the codec menu names it',
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
// W3-20b: the miles profile (vaudio_miles of the Source engines of 2006 and
// 2007, not a TF2 codec) on the page: the codec menu's two groups, the note
// under the control, a render's words, its playback and download, the console
// and a share link.
const MILES_NOTE = 'vaudio_miles is not a TF2 codec. The Source engines of 2006 and 2007 could run it; current TF2 ships its files and refuses the name. '
  + 'Its codec was checked against one recording of a 2006 engine; the rest of the profile was not. Everything after the receiver\'s gain is TF2\'s of today.';
async function verifyMilesPage(page) {
  console.log('\n[Browser 3c2b] The miles profile on the page (W3-20b)');
  const menu = await page.evaluate(() => {
    const select = document.getElementById('codec');
    return { groups: [...select.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]),
      loose: [...select.children].filter((c) => c.tagName === 'OPTION').map((o) => o.value),
      option: select.querySelector('option[value="miles"]')?.textContent || '', described: (select.getAttribute('aria-describedby') || '').split(/\s+/),
      label: document.querySelector('label[for="codec"]').textContent.replace(/\s+/g, ' ').trim() };
  });
  check(JSON.stringify(menu.groups) === JSON.stringify([['Team Fortress 2', ['steam', 'celt_22', 'celt_44', 'speex']], ['Not in Team Fortress 2', ['steam_48', 'miles']]])
    && menu.loose.length === 0,
    'the codec menu has two groups: "Team Fortress 2" holds exactly steam, celt_22, celt_44 and speex; "Not in Team Fortress 2" exactly steam_48 and miles',
    JSON.stringify(menu.groups));
  check(/^vaudio_miles: not in TF2( \(VR12, 2\.9 kbit\/s\)| \(VR12\))$/.test(menu.option) && /sv_voicecodec/.test(menu.label),
    'the miles option says itself that it is not in TF2; the control keeps sv_voicecodec', `${menu.option}; ${menu.label}`);
  // The control's accessible description, as the browser computes it (CDP):
  // a screen reader reads a hidden element that aria-describedby names, so the
  // note is named there only while it is shown (review round, S1).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const description = async () => {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#codec' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return (nodes[0] && nodes[0].description && nodes[0].description.value || '').replace(/\s+/g, ' ').trim();
  };
  const notes = {};
  for (const key of ['steam', 'steam_48', 'celt_22', 'celt_44', 'speex', 'miles', 'steam']) {
    await page.locator('#codec').selectOption(key);
    const seenNote = await page.evaluate(() => {
      const n = document.getElementById('codec-note');
      return { hidden: n.hidden, shown: n.getClientRects().length > 0, text: n.textContent.replace(/\s+/g, ' ').trim(),
        described: document.getElementById('codec').getAttribute('aria-describedby') };
    });
    notes[key === 'steam' && notes.miles ? 'steam again' : key] = { ...seenNote, description: await description() };
  }
  await cdp.detach();
  await page.locator('#codec').selectOption('miles');
  const others = ['steam', 'steam_48', 'celt_22', 'celt_44', 'speex', 'steam again'];
  check(others.every((k) => notes[k].hidden && !notes[k].shown) && !notes.miles.hidden && notes.miles.shown && notes.miles.text === MILES_NOTE,
    'the note under the codec control is hidden for the other five profiles and shown, with its exact text, for miles (and hidden again after it)',
    JSON.stringify(Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.shown]))) + ` ${notes.miles.text}`);
  const help = await page.evaluate(() => document.getElementById('codec-help').textContent.replace(/\s+/g, ' ').trim());
  check(others.every((k) => notes[k].described === 'codec-help' && notes[k].description === help)
    && notes.miles.described === 'codec-help codec-note' && notes.miles.description === `${help} ${MILES_NOTE}`,
    'the control\'s accessible description is its help alone on a TF2 profile (no note), and the help and the note on miles',
    `steam: "${notes.steam.description}"; miles: "${notes.miles.description}"`);
  // A render: the console, the status line, the chain strip and the lane.
  const consoleFrom = 'test: the miles render starts here';
  await page.evaluate((n) => logLine(n, 'sys'), consoleFrom);
  await renderNow(page);
  await page.waitForFunction(() => [...document.querySelectorAll('#viz-legend .lg-item')].some(e => e.querySelector('.lg-box')));
  const seen = await page.evaluate((from) => {
    const items = [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box'));
    const chain = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec');
    return { legend: items.map(e => e.textContent), legendTitles: items.map(e => e.title || e.querySelector('[title]')?.title || ''),
      // The console's lines (one element each) after the marker.
      console: (() => { const all = [...document.getElementById('console-out').children].map(e => e.textContent); return all.slice(all.lastIndexOf(from) + 1); })(),
      status: document.getElementById('render-status').textContent,
      chain: chain ? chain.textContent : '', frames: state.lastCodecInfo.frames, codes: [...state.lastCodecInfo.frameLog] };
  }, consoleFrom);
  const lines = seen.console.filter(l => l.includes('S_Voice'));
  const first = lines.findIndex(l => /S_Voice: Voxware VR12/.test(l));
  check(first >= 0 && /S_Voice: Voxware VR12 \(voxware-vr12 eedf465\), 2\.94 kbps CBR, 12-byte packets of 32\.7 ms, a lost frame plays as zeros \(VR12 100%\)/.test(lines[first])
    && /S_Voice: vaudio_miles is not a TF2 codec \(Source engines of 2006 and 2007\); its codec was checked against one recording of a 2006 engine; the rest of the profile was not$/.test(lines[first + 1] || ''),
    'the S_Voice line names Voxware VR12, its 12-byte frames and zeros for a lost frame, and the next line says it is not a TF2 codec', lines.join(' | '));
  // W4-01a: the render's status line names the codec by the menu's words,
  // which keep "not in TF2" for vaudio_miles.
  check(/^Rendered in \d+\.\d s · .* · vaudio_miles: not in TF2/.test(seen.status), 'the render\'s status line names vaudio_miles, not in TF2', seen.status);
  const words = 'VR12 on 11.025 kHz sound · 12-byte frames of 32.65 ms · 2.94 kbit/s · not a TF2 codec';
  check(seen.chain === `Codec${words}`, 'the chain strip\'s Codec cell describes VR12 on 11.025 kHz sound and says it is not a TF2 codec', seen.chain);
  check(seen.legend.length === 1 && seen.legend[0] === `VR12 ${seen.frames}` && seen.codes.every(c => c === 8),
    'a miles render\'s codec lane counts every frame as VR12 (code 8)', seen.legend.join(', '));
  const texts = [...seen.legend, ...seen.legendTitles, ...lines, seen.status, seen.chain, menu.option];
  check(texts.every(t => !/CELT|Opus|SILK|Speex/.test(t)), 'none of them calls a miles render CELT, Opus, SILK or Speex',
    texts.filter(t => /CELT|Opus|SILK|Speex/.test(t)).join(' / '));
  const at8 = await page.evaluate(() => {
    const set = (v) => { els.bits.value = v; for (const type of ['input', 'change']) els.bits.dispatchEvent(new Event(type, { bubbles: true })); };
    set('8');
    const text = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec').textContent;
    set('16');
    return text;
  });
  check(at8 === `Codec${words} · snd_bits not used`, 'at snd_bits 8 the cell adds that snd_bits is not used', at8);
  // It plays and downloads, as W3-17d's check of each room does it.
  const got = await page.evaluate(async () => {
    const a = els.audio;
    if (!(a.duration > 0)) await new Promise((r) => a.addEventListener('loadedmetadata', r, { once: true }));
    a.muted = true; await a.play(); await new Promise((r) => setTimeout(r, 150));
    const played = a.currentTime; a.pause(); a.currentTime = 0; a.muted = false;
    return { length: state.processedBuffer.length, rate: state.processedRate, source: Math.round(state.decodedSource.length * state.processedRate / state.decodedSource.sampleRate),
      duration: a.duration, played, key: state.lastCodecKey };
  });
  const wav = await readRenderedWav(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const saved = fs.readFileSync(await download.path());
  check(wav.frames === got.length && got.length === got.source && saved.length === 44 + 2 * got.length
    && saved.equals(Buffer.from(await page.evaluate(async () => [...new Uint8Array(await state.lastWav.arrayBuffer())])))
    && Math.abs(got.duration - got.length / got.rate) < 0.01 && got.played > 0 && /_tf2_miles\.wav$/.test(download.suggestedFilename()),
    'a miles render plays, and its download is the rendered WAV', `${got.length} samples; ${download.suggestedFilename()}`);
  // The console and a share link.
  const picked = await page.evaluate(() => {
    execCommand('exec preset_modern');
    execCommand('sv_voicecodec miles');
    const byConsole = els.codec.value;
    execCommand('exec preset_modern');
    history.replaceState(null, '', '#codec=miles'); applyHashConfig();
    const byLink = els.codec.value, note = !document.getElementById('codec-note').hidden;
    history.replaceState(null, '', location.pathname);
    execCommand('exec preset_modern');
    return { byConsole, byLink, note };
  });
  check(picked.byConsole === 'miles' && picked.byLink === 'miles' && picked.note,
    'the console\'s sv_voicecodec miles selects it, and a link with #codec=miles restores it (the note shown)', JSON.stringify(picked));
}

async function verifyCeltPage(page) {
  console.log('\n[Browser 3c3] The CELT profiles on the page');
  const render = () => renderNow(page);
  const labels = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#codec option')].map(o => [o.value, o.textContent])));
  check(labels.celt_22 === 'vaudio_celt (CELT, 22 kHz)' && labels.celt_44 === 'vaudio_celt_high (44 kHz mode)',
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
  // The long file renders by itself; a file dropped while it renders stops
  // that render and renders as itself (W4-01a).
  // The dropped file is made first, so the drop comes the moment the long
  // file's render has begun (a minute of sound: it is still rendering).
  await page.evaluate((bytes) => { window.__dropShort = new File([new Uint8Array(bytes)], 'short.wav', { type: 'audio/wav' }); }, [...wavTone(1, 48000, 880)]);
  // No render of the step before is still running.
  await page.waitForFunction(() => renderIdle(), null, { timeout: 60000 });
  const before = await page.evaluate(() => state.renderId);
  await page.locator('#file').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: wavTone(60, 16000) });
  await page.waitForFunction(() => state.sourceName === 'long.wav' && state.processing);
  // Dropped outside the batch panel, one file becomes the source (batch.js).
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(window.__dropShort);
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.waitForFunction(() => state.sourceName === 'short.wav', null, { timeout: 60000 });
  await waitRendered(page);
  const after = await page.evaluate(() => ({ renders: state.renderId, seconds: state.processedBuffer.length / state.processedRate, download: !els.dl.disabled,
    process: !els.process.disabled, status: els.status.textContent, log: document.getElementById('console-out').textContent }));
  check(after.renders === before + 1 && Math.abs(after.seconds - 1) < .01 && after.download && after.process && after.status.startsWith('short.wav')
    && /render of the previous source stopped/.test(after.log) && !/the source changed during the render/.test(after.log),
    'a source dropped during a render stops that render, and renders as itself', `${after.seconds.toFixed(3)} s; ${after.renders - before} render shown; ${after.status}`);
  // Presets reset every receiver setting, Phrase timing and voice_buffer_ms
  // included, and leave the listener's frame rate, a property of the
  // listener's PC (W3-02d-1).
  const timing = await page.evaluate(() => {
    execCommand('voice_timeline source'); execCommand('voice_buffer_ms 250'); execCommand('fps_max 67'); execCommand('exec preset_modern');
    const out = { tl: els.timeline.value, buf: els.bufferMs.value, fps: els.fps.value };
    execCommand('fps_max 300');
    return out;
  });
  check(timing.tl === 'game' && timing.buf === '100' && timing.fps === '67',
    'a preset sets Phrase timing back to the game\'s voice queue and voice_buffer_ms to 100, and leaves fps_max as it was', JSON.stringify(timing));
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

  // W3-02c-3b: the game's voice queue in the monitor, behind its own switch
  // (off on load). The page's config messages to the live worker are kept
  // from here to the block's end.
  {
    await page.evaluate(() => {
      window.__liveConfigs = [];
      window.__livePost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, transfer) {
        if (message && message.type === 'config') window.__liveConfigs.push(message.opts);
        return window.__livePost.call(this, message, transfer);
      };
    });
    const queueState = () => page.evaluate(() => ({ checked: document.getElementById('live-queue').checked, help: document.getElementById('live-queue-help').textContent,
      low: { disabled: document.getElementById('live-lowlat').disabled, checked: document.getElementById('live-lowlat').checked, title: document.getElementById('live-lowlat').closest('label').title },
      configs: window.__liveConfigs.length, opts: window.__liveConfigs[window.__liveConfigs.length - 1] || null, queue: TF2Live.queue, ms: TF2Live.stats.latencyMs,
      channel: TF2Live.stats.channel || null, arrivals: TF2Live.stats.arrivals || null, codec: TF2Live.stats.codec, panel: document.getElementById('live-latency').textContent,
      panelTitle: document.getElementById('live-latency').closest('.live-stat').title, note: document.getElementById('live-note').textContent,
      noteError: document.getElementById('live-note').classList.contains('error'), running: TF2Live.running }));
    const before = await queueState();
    check(!before.checked && before.queue.timeline === 'source' && !before.channel, 'the live monitor\'s switch for the game\'s voice queue is off, and the chain keeps the file\'s own timing',
      JSON.stringify({ checked: before.checked, queue: before.queue }));
    // Checked on Steam voice with low latency ticked: the chain runs the
    // queue at the page's frame rate and buffer, low latency disabled and
    // sent as off.
    await page.locator('#live-lowlat').check();
    await page.locator('#live-queue').check();
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'game' && TF2Live.stats && TF2Live.stats.channel && TF2Live.stats.channel.opens > 0,
      null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const on = await queueState();
    const panelMs = Number(/^(\d+) ms/.exec(on.panel)?.[1]);
    check(on.opts && on.opts.timeline === 'game' && on.opts.fps === 300 && on.opts.bufferMs === 100 && on.opts.lowLatency === false && on.low.disabled && on.low.checked
      && /voice queue/.test(on.low.title),
      'with the switch on, on Steam voice: the chain\'s options hold timeline game and the page\'s fps_max and voice_buffer_ms; the low-latency box is disabled and sent as off',
      JSON.stringify({ opts: on.opts && { timeline: on.opts.timeline, fps: on.opts.fps, bufferMs: on.opts.bufferMs, lowLatency: on.opts.lowLatency }, low: on.low.disabled }));
    check(Math.abs(on.ms - fullMs - on.queue.queueCostMs) < 1e-6 && on.queue.queueCostMs > 300 && panelMs >= on.ms && panelMs < on.ms + 400,
      'the chain\'s delay rises by the cost the chain reports, and the panel shows between that delay and 400 ms more',
      `${fullMs.toFixed(1)} ms off, ${on.ms.toFixed(1)} ms on, the chain's cost ${on.queue.queueCostMs.toFixed(2)} ms; the panel ${on.panel}`);
    check(on.help.includes(`plays ${on.queue.queueCostMs.toFixed(0)} ms later`) && /fps_max 300 and voice_buffer_ms 100/.test(on.help)
      && /114 to 181 ms/.test(on.help) && /each phrase comes later again by the time its first packet took/.test(on.help)
      && /waits 30 ticks, 435 ms, at fps_max 300/.test(on.panelTitle) && on.channel.opens > 0,
      'the switch\'s help holds the chain\'s cost and what a listener hears; the panel\'s title names the queue\'s wait; TF2Live.stats.channel.opens is above 0',
      `${on.channel.opens} opens; ${on.help.slice(0, 160)}...`);
    // Phrase timing does not decide the monitor.
    await page.evaluate(() => execCommand('voice_timeline source'));
    await page.waitForTimeout(900);
    const sourceTimed = await queueState();
    await page.evaluate(() => execCommand('voice_timeline game'));
    check(sourceTimed.configs === on.configs && sourceTimed.queue.timeline === 'game' && sourceTimed.running,
      'with Phrase timing on the file\'s own timing the monitor still runs the queue: nothing is sent to its chain', JSON.stringify({ configs: sourceTimed.configs - on.configs, queue: sourceTimed.queue }));
    // A changed fps_max builds a new chain, and the help follows it.
    await page.evaluate(() => execCommand('fps_max 67'));
    await page.waitForFunction(() => TF2Live.stats.channel && TF2Live.stats.channel.fps === 67 && TF2Live.queue.queueCostMs < 200, null, { timeout: 20000 });
    const at67 = await queueState();
    await page.evaluate(() => execCommand('fps_max 300'));
    await page.waitForFunction(() => TF2Live.stats.channel && TF2Live.stats.channel.fps === 300 && TF2Live.queue.queueCostMs > 300, null, { timeout: 20000 });
    check(at67.configs > on.configs && at67.opts.fps === 67 && at67.help.includes(`plays ${at67.queue.queueCostMs.toFixed(0)} ms later`)
      && at67.queue.queueCostMs.toFixed(0) !== on.queue.queueCostMs.toFixed(0) && /fps_max 67 and/.test(at67.help),
      'with the switch on, a changed fps_max builds a new chain, and the help holds that chain\'s cost at the new frame rate',
      `${at67.queue.queueCostMs.toFixed(2)} ms at fps_max 67`);
    // Off: the help still gives the figure at the page's own frame rate, not
    // the chain's (which, made with no fps, reports the module's default).
    await page.locator('#live-queue').uncheck();
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'source' && !TF2Live.stats.channel, null, { timeout: 20000 });
    await page.evaluate(() => execCommand('fps_max 67'));
    await page.waitForTimeout(400);
    const off67 = await queueState();
    await page.evaluate(() => execCommand('fps_max 300'));
    check(off67.help.includes(`plays ${at67.queue.queueCostMs.toFixed(0)} ms later`) && Math.abs(off67.queue.queueCostMs - on.queue.queueCostMs) < 1e-6 && !off67.low.disabled,
      'with the switch off at fps_max 67, the help gives the cost at 67 frames a second, not the chain\'s at its defaults; low latency is live again',
      `${off67.help.slice(0, 140)}...; the chain's ${off67.queue.queueCostMs.toFixed(2)} ms`);
    // On the other codecs, and with the codec skipped, the checked switch
    // does nothing: the chain keeps the file's own timing, no error shows,
    // and low latency still works.
    await page.locator('#live-queue').check();
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'game' && TF2Live.stats.channel, null, { timeout: 20000 });
    const others = {};
    for (const codec of ['celt_22', 'steam_48', 'miles']) {
      await page.locator('#codec').selectOption(codec);
      await page.waitForFunction((c) => TF2Live.stats && TF2Live.stats.codec === c && TF2Live.stats.sent > 10, codec, { timeout: 20000 });
      await page.waitForTimeout(400);
      others[codec] = await queueState();
    }
    await page.locator('#codec').selectOption('steam');
    await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.codec === 'steam' && TF2Live.queue.timeline === 'game', null, { timeout: 20000 });
    await page.locator('#warble_on').selectOption('0');
    await page.waitForFunction(() => window.__liveConfigs.length && window.__liveConfigs[window.__liveConfigs.length - 1].enableWarble === false, null, { timeout: 5000 });
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'source', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    others.skipped = await queueState();
    await page.locator('#warble_on').selectOption('1');
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'game' && TF2Live.stats.channel, null, { timeout: 20000 });
    const quiet = Object.entries(others).filter(([, o]) => !(o.opts.timeline === 'source' && o.opts.fps === undefined && o.queue.timeline === 'source' && !o.channel
      && !o.noteError && o.running && o.opts.lowLatency === true && !o.low.disabled && /off on every load|keeps the file's own timing/i.test(o.help)));
    check(quiet.length === 0, 'on celt_22, steam_48 and miles (neither in TF2) and with the codec skipped the checked switch does nothing: the chain keeps the file\'s own timing, no error shows, low latency still works',
      quiet.map(([c, o]) => `${c}: ${JSON.stringify({ timeline: o.opts.timeline, queue: o.queue, low: o.opts.lowLatency, error: o.noteError })}`).join('; ') || Object.keys(others).join(', '));
    await page.locator('#live-queue').uncheck();
    await page.locator('#live-lowlat').uncheck();
    await page.waitForFunction((full) => TF2Live.queue.timeline === 'source' && TF2Live.stats.latencyMs === full, fullMs, { timeout: 15000 });
    await page.evaluate(() => { Worker.prototype.postMessage = window.__livePost; });
  }

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
    // A render of the source on the page (the codec changed) is not this take's.
    await page.waitForFunction(() => renderIdle(), null, { timeout: 30000 });
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
      // On the file's own timing, as voice_timeline source renders: the live
      // monitor keeps it (live.js, liveOptions; W3-02d-1), and a render on the
      // game's voice queue moves phrases the monitor does not.
      const render = (await TF2Audio.process(state.decodedSource, { ...renderOptions(), timeline: 'source', fps: undefined, bufferMs: undefined, deviceRate: rate })).samples;
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
        ab: !document.querySelector('#ab-group [data-ab="dry"]').disabled };
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
  // W3-02d-1: the take was made on the file's own timing, and Phrase timing
  // is on the game's voice queue. The take's key is the file's own timing; it
  // is marked and held back from a render by itself, as a cancelled render
  // is; one press of Render gives a render on the game's timeline.
  {
    await page.waitForTimeout(1500);
    const held = await page.evaluate(() => {
      const lines = [...document.getElementById('console-out').children].map((e) => e.textContent);
      const from = lines.map((t) => t.startsWith('voice_record: live take of')).lastIndexOf(true);
      return { key: JSON.parse(state.renderedKey), live: !!state.lastCodecInfo.live, stale: state.stale, idle: renderIdle(), tl: els.timeline.value, download: els.dl.textContent,
        line: !els.hearTimeline.hidden, status: els.renderStatus.textContent, started: lines.slice(from + 1).filter((t) => t.startsWith('S_StartSound: initializing render')).length };
    });
    check(held.tl === 'game' && held.live && held.key.timeline === 'source' && !('fps' in held.key) && held.stale && held.idle && held.started === 0 && !held.line
      && held.download === 'Download WAV (the live take)'
      && /^Recorded live · .* · on the file's own timing; Render gives it on the game's voice queue$/.test(held.status),
      'a recorded live take with Phrase timing on the game\'s queue: its key holds timeline source and no fps; it is marked, no render starts by itself, the line beside Hear is hidden, the download says it is the live take',
      `${held.started} started; ${held.status}; ${held.download}`);
    await renderNow(page);
    const rendered = await page.evaluate(() => ({ channel: !!(state.lastCodecInfo && state.lastCodecInfo.channel), stale: state.stale, line: !els.hearTimeline.hidden }));
    check(rendered.channel && !rendered.stale && rendered.line, 'one press of Render gives the take a render on the game\'s timeline, with the line beside Hear', JSON.stringify(rendered));
    // The monitor keeps the file's own timing: a changed fps_max, voice_buffer_ms
    // or Phrase timing sends its chain no new settings, so it does not restart;
    // voice_scale does (the count's own check).
    const configs = await page.evaluate(async () => {
      let count = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, transfer) { if (message && message.type === 'config') count++; return post.call(this, message, transfer); };
      const pause = () => new Promise((resolve) => setTimeout(resolve, 900));
      try {
        execCommand('fps_max 67'); execCommand('voice_buffer_ms 200'); execCommand('voice_timeline source');
        await pause();
        const queue = count;
        execCommand('voice_scale 0.9');
        await pause();
        const scale = count;
        execCommand('fps_max 300'); execCommand('voice_buffer_ms 100'); execCommand('voice_timeline game'); execCommand('voice_scale 1');
        await pause();
        return { queue, scale, running: TF2Live.running };
      } finally { Worker.prototype.postMessage = post; }
    });
    check(configs.running && configs.queue === 0 && configs.scale === 1,
      'the live monitor: a changed fps_max, voice_buffer_ms or Phrase timing while it runs sends its chain nothing, so it does not restart; voice_scale does', JSON.stringify(configs));
    await page.waitForFunction(() => renderIdle(), null, { timeout: 30000 });
  }
  // W3-02c-3b: a session recorded with the queue's switch on. Its key is the
  // page's on the game's voice queue at the chain's frame rate and buffer; it
  // carries the channel's counts, so the line beside Hear shows and the
  // console prints the queue's line. With Phrase timing on the queue it is
  // not marked and no render starts; with Phrase timing on the file's own
  // timing it is held, with its own line.
  {
    await page.locator('#live-queue').check();
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'game' && TF2Live.stats.channel && TF2Live.stats.channel.opens > 0, null, { timeout: 20000 });
    await page.waitForTimeout(4000);
    const queueTake = async () => {
      await page.waitForFunction(() => renderIdle(), null, { timeout: 30000 });
      // The chain's count of packets just before the recording starts and
      // 1.5 s after the take is loaded (the panel's stats come ten times a
      // second, so the take's own count lies between 0 and their difference;
      // the chain's count since it was built, 4 s more, does not).
      const packetsBefore = await page.evaluate(() => { window.__takeBefore = state.decodedSource; return TF2Live.stats.channel.packets; });
      await page.locator('#live-record').click();
      await page.waitForTimeout(3000);
      await page.locator('#live-record').click();
      await page.waitForFunction(() => state.sourceName && state.sourceName.startsWith('live-') && state.processedBuffer
        && state.decodedSource && state.decodedSource !== window.__takeBefore, null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      const packetsAfter = await page.evaluate(() => TF2Live.stats.channel.packets);
      return page.evaluate(({ packetsBefore, packetsAfter }) => {
        const lines = [...document.getElementById('console-out').children].map((e) => e.textContent);
        const from = lines.map((t) => t.startsWith('voice_record: live take of')).lastIndexOf(true);
        const wet = state.processedBuffer;
        let loud = 0;
        for (const v of wet) if (Math.abs(v) > 0.01) loud++;
        return { key: JSON.parse(state.renderedKey), channel: state.lastCodecInfo.channel || null, packetsBefore, packetsAfter, stale: state.stale, idle: renderIdle(), line: !els.hearTimeline.hidden,
          status: els.renderStatus.textContent, loud, length: wet.length, rate: state.processedRate,
          queueLine: lines.slice(from).find((t) => t.startsWith('S_Voice: the game\'s voice queue at fps_max')) || '',
          started: lines.slice(from + 1).filter((t) => t.startsWith('S_StartSound: initializing render')).length };
      }, { packetsBefore, packetsAfter });
    };
    const onQueue = await queueTake();
    check(onQueue.loud > onQueue.rate * 0.5 && onQueue.key.timeline === 'game' && onQueue.key.fps === 300 && onQueue.key.bufferMs === 100 && onQueue.channel
      && onQueue.channel.fps === 300 && onQueue.channel.packets > 0 && onQueue.channel.packets <= onQueue.packetsAfter - onQueue.packetsBefore && !onQueue.stale && onQueue.idle && onQueue.started === 0 && onQueue.line
      && /^S_Voice: the game's voice queue at fps_max 300, voice_buffer_ms 100: a new phrase waits 30 ticks \(435 ms\)/.test(onQueue.queueLine)
      && /^Recorded live · /.test(onQueue.status),
      'a session recorded with the switch on is not silent; its key holds timeline game, fps 300 and voice_buffer_ms 100; its channel counts are the recording\'s, not the chain\'s since it was built; with Phrase timing on the queue it is not marked, no render starts by itself, the line beside Hear shows and the console prints the queue\'s line',
      `${onQueue.loud} samples above 0.01 of ${onQueue.length}; ${onQueue.channel && onQueue.channel.packets} packets, the chain's count from ${onQueue.packetsBefore} to ${onQueue.packetsAfter}; ${onQueue.started} started; ${onQueue.queueLine}; ${onQueue.status}`);
    // Phrase timing on the file's own timing renders that take again (it is
    // short); the next take is held.
    await page.evaluate(() => execCommand('voice_timeline source'));
    await page.waitForFunction(() => renderIdle() && !state.lastCodecInfo.live, null, { timeout: 30000 });
    const heldQueue = await queueTake();
    check(heldQueue.key.timeline === 'game' && heldQueue.stale && heldQueue.idle && heldQueue.started === 0 && heldQueue.line
      && /^Recorded live · .* · on the game's voice queue; Render gives it on the file's own timing$/.test(heldQueue.status),
      'a session recorded with the switch on and Phrase timing on the file\'s own timing is held: marked, no render starts by itself, and its line says it was made on the game\'s voice queue',
      `${heldQueue.started} started; ${heldQueue.status}`);
    // Back on the queue, the controls' key is the take's: nothing is marked and nothing renders.
    await page.evaluate(() => execCommand('voice_timeline game'));
    await page.waitForTimeout(900);
    const back = await page.evaluate(() => ({ stale: state.stale, idle: renderIdle(), live: !!state.lastCodecInfo.live, status: els.renderStatus.textContent }));
    check(!back.stale && back.idle && back.live && !/Render gives it/.test(back.status), 'with Phrase timing back on the queue, the held take is the controls\' render: not marked, no render started', JSON.stringify(back));
    await page.locator('#live-queue').uncheck();
    await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'source', null, { timeout: 20000 });
  }
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
  await page.waitForFunction(() => renderIdle(), null, { timeout: 30000 });
  await page.evaluate(() => logLine('test: the speex take starts here', 'sys'));
  const consoleFrom = 'test: the speex take starts here';
  await page.locator('#live-record').click();
  await page.waitForTimeout(1500);
  await page.locator('#live-record').click();
  await page.waitForFunction((n) => document.getElementById('console-out').textContent.split(n).pop().includes('S_Voice'), consoleFrom, { timeout: 20000 });
  const speexTake = await page.evaluate((n) => ({ console: document.getElementById('console-out').textContent.split(n).pop().split('\n').filter(l => l.includes('S_Voice')).join(' | '),
    status: document.getElementById('render-status').textContent,
    legend: [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box')).map(e => e.textContent) }), consoleFrom);
  check(mode === 'Speex' && /S_Voice: Speex 1\.0\.2, 11\.025 kbps CBR, 14\.5 ms, a lost frame plays as zeros \(Speex 100%\)/.test(speexTake.console)
    && /^Recorded live · .* · vaudio_speex \(Speex, 11 kHz\)$/.test(speexTake.status) && speexTake.legend.some(t => /^Speex \d+$/.test(t))
    && !speexTake.legend.some(t => /^(SILK|Hybrid|CELT|DTX) /.test(t))
    && ![speexTake.console, speexTake.status, ...speexTake.legend].some(t => /CELT|Opus|SILK/.test(t)),
    'the live panel and a recorded speex take name Speex, not CELT or Opus', `mode ${mode}; ${speexTake.console}; ${speexTake.legend.join(', ')}`);
  // W3-20b: the miles profile live: the panel's mode, and a recorded take, name VR12.
  await page.locator('#codec').selectOption('miles');
  await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.codec === 'miles' && TF2Live.stats.sent > 15, null, { timeout: 20000 });
  const milesMode = await page.locator('#live-mode').textContent();
  await page.waitForFunction(() => renderIdle(), null, { timeout: 30000 });
  await page.evaluate(() => logLine('test: the miles take starts here', 'sys'));
  const milesFrom = 'test: the miles take starts here';
  await page.locator('#live-record').click();
  await page.waitForTimeout(1500);
  await page.locator('#live-record').click();
  await page.waitForFunction((n) => document.getElementById('console-out').textContent.split(n).pop().includes('S_Voice'), milesFrom, { timeout: 20000 });
  const milesTake = await page.evaluate((n) => ({ console: document.getElementById('console-out').textContent.split(n).pop().split('\n').filter(l => l.includes('S_Voice')).join(' | '),
    status: document.getElementById('render-status').textContent,
    legend: [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box')).map(e => e.textContent),
    backend: state.lastCodecInfo.backend, plc: state.lastCodecInfo.plc }), milesFrom);
  check(milesMode === 'VR12' && /S_Voice: Voxware VR12 \(voxware-vr12 eedf465\), 2\.94 kbps CBR, 32\.7 ms, a lost frame plays as zeros \(VR12 100%\)/.test(milesTake.console)
    && /S_Voice: vaudio_miles is not a TF2 codec/.test(milesTake.console)
    && /^Recorded live · .* · vaudio_miles: not in TF2/.test(milesTake.status) && milesTake.legend.some(t => /^VR12 \d+$/.test(t)) && milesTake.backend === 'vr12' && milesTake.plc === 'zeros'
    && ![milesTake.console, milesTake.status, ...milesTake.legend].some(t => /CELT|Opus|SILK|Speex/.test(t)),
    'the live panel\'s mode reads VR12 with miles, and a recorded take names Voxware VR12, not CELT, Opus, SILK or Speex',
    `mode ${milesMode}; ${milesTake.console}; ${milesTake.legend.join(', ')}`);
  // vaudio_celt_high live: the 44100 Hz mode on 22050 Hz sound, 46.4 ms frames.
  await page.locator('#codec').selectOption('celt_44');
  await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.codec === 'celt_44' && TF2Live.stats.sent > 20, null, { timeout: 20000 });
  const celtLive = await page.evaluate(() => ({ mode: document.getElementById('live-mode').textContent, stats: TF2Live.stats }));
  check(celtLive.mode === 'CELT' && celtLive.stats.modes.celt > 20 && celtLive.stats.modes.celt === celtLive.stats.sent,
    'the live chain runs celt_44: every frame sent is CELT', `mode ${celtLive.mode}; ${celtLive.stats.modes.celt} CELT of ${celtLive.stats.sent} sent`);
  await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
  // BC-4b: with the queue's switch off the monitor keeps the file's own
  // timing, so on Steam voice its note says that jitter does nothing there;
  // not on another codec (the fit runs there), not at jitter 0, and not once
  // the monitor has stopped. With the switch on it says nothing of it
  // (W3-02c-3b), and the chain counts the packets' arrivals.
  const liveJitter = await page.evaluate(() => {
    const note = () => document.getElementById('live-note').textContent;
    const netTitle = () => document.getElementById('live-loss').closest('.live-stat').title;
    const out = { start: note(), steamTitle: netTitle() };
    execCommand('net_fakejitter 50'); out.steam = note();
    execCommand('sv_voicecodec celt_22'); out.celt = note(); out.celtTitle = netTitle();
    execCommand('sv_voicecodec steam'); out.again = note();
    execCommand('net_fakejitter 0'); out.zero = note();
    execCommand('net_fakejitter 50');
    return out;
  });
  const jitterLine = 'Jitter does nothing in the live monitor on the file\'s own timing.';
  check(!liveJitter.start.includes(jitterLine) && liveJitter.steam === `${liveJitter.start} ${jitterLine}` && liveJitter.celt === liveJitter.start
    && liveJitter.again === liveJitter.steam && liveJitter.zero === liveJitter.start,
    'while the live monitor runs on Steam voice with jitter 50 and its queue\'s switch off, its note adds "Jitter does nothing in the live monitor on the file\'s own timing."; on celt_22 and at jitter 0 it does not', JSON.stringify(liveJitter));
  await page.locator('#live-queue').check();
  await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'game' && TF2Live.stats.arrivals && TF2Live.stats.arrivals.messages > 0, null, { timeout: 20000 });
  const queueJitter = await page.evaluate(() => ({ note: document.getElementById('live-note').textContent, arrivals: TF2Live.stats.arrivals }));
  await page.locator('#live-queue').uncheck();
  await page.waitForFunction(() => TF2Live.queue && TF2Live.queue.timeline === 'source', null, { timeout: 20000 });
  check(!queueJitter.note.includes('Jitter does nothing') && queueJitter.note === liveJitter.start && queueJitter.arrivals.jitterMs === 50,
    'with the queue\'s switch on at jitter 50 the note says nothing of jitter, and TF2Live.stats.arrivals is there', JSON.stringify(queueJitter));
  // The fix round: the "net" figure's title on Steam voice says no frame is late; index.html's first title is the same.
  const liveNetTitle = 'Frames concealed: lost frames (net_fakeloss) the decoder filled in when the next one arrived. On Steam voice no frame is late';
  const htmlNetTitle = /<span class="live-stat" title="([^"]*)">net <b id="live-loss">/.exec(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'))?.[1];
  check(liveJitter.steamTitle === liveNetTitle && htmlNetTitle === liveNetTitle && liveJitter.celtTitle === 'Frames lost (concealed) and late (silence) by the network settings',
    'the live "net" figure\'s title on Steam voice says the frames are concealed lost frames, by net_fakeloss, and that no frame is late, as index.html\'s first title does; on celt_22 it keeps the late frames',
    `${liveJitter.steamTitle} | ${htmlNetTitle} | ${liveJitter.celtTitle}`);
  await page.locator('#live-toggle').click();
  await page.waitForFunction(() => !TF2Live.running);
  check(await page.locator('#live-toggle').getAttribute('aria-pressed') === 'false', 'the live monitor stops');
  const stoppedNote = await page.evaluate(() => { const n = document.getElementById('live-note').textContent; execCommand('net_fakejitter 0'); return n; });
  check(stoppedNote === 'Stopped.', 'with jitter 50 on Steam voice, the stopped monitor\'s note is "Stopped." alone', stoppedNote);
}

// W3-17d: the rule for which controls are the game's, which the two PCs'
// and which the app's own extras (the order's part d, item 4), copied from
// the order, not made from the page. Ids of the page's controls.
// W3-02d-1: voice_buffer_ms is the game's; the listener's frame rate is a
// property of the listener's PC, whose cap the game has (fps_max); Phrase
// timing is an extra, its second value being the app's own.
const CONTROLS_GAME = ['codec', 'listener_position', 'env', 'a_sky', 'a_w', 'a_l', 'a_h', 'a_open', 'a_refl', 'underwater',
  'avggain', 'maxgain', 'voice_scale', 'volume', 'loss', 'jitter', 'live-ptt', 'buffer_ms'];
const CONTROLS_PCS = ['capture_channel', 'steam_uptime', 'device_rate', 'live-input', 'live-output', 'fps'];
const CONTROLS_EXTRAS = ['gain', 'hp', 'lp', 'vad', 'vad_threshold', 'warble_on', 'bits', 'frameMs', 'agc', 'timeline',
  'c_dur', 'c_dec', 'c_mix', 'live-lowlat', 'live-queue'];
// The game's controls whose label shows the game's variable (`class="cvar"`).
const CONTROLS_NAMED = { codec: 'sv_voicecodec', listener_position: 'dsp_room', env: 'dsp_room', avggain: 'voice_avggain',
  maxgain: 'voice_maxgain', voice_scale: 'voice_scale', volume: 'volume', loss: 'net_fakeloss', jitter: 'net_fakejitter', 'live-ptt': '+voicerecord',
  fps: 'fps_max', buffer_ms: 'voice_buffer_ms' };

async function verifyRoomsPage(page) {
  console.log('\n[Browser 3c4] Rooms on the page (W3-17d)');
  await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
  // The listener position's choices, in the order's order, the first chosen.
  const list = await page.evaluate(() => {
    const select = els.position;
    return { value: select.value, first: select.options[0].value, def: DEFAULT_LISTENER,
      groups: [...select.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]),
      loose: [...select.children].filter((c) => c.tagName === 'OPTION').map((o) => `${o.value}: ${o.textContent}`),
      cases: TF2Room.ROOM_CASES.map((r) => r.key), measured: TF2Room.ROOM_CASES.filter((r) => r.measured).map((r) => r.key),
      places: TF2Room.ROOM_PLACES.map((r) => r.key), presets: PRESETS.modern.position + PRESETS.legacy.position + PRESETS.laggy.position };
  });
  const group = (label) => (list.groups.find(([l]) => l === label) || [null, []])[1];
  const examples = list.cases.filter((k) => !list.measured.includes(k));
  check(list.def === 'open' && list.value === 'open' && list.first === 'open' && list.presets === 'openopenopen'
    && list.loose.join(' | ') === 'open: No room effect (the game\'s Sound quality: Low) | manual: Manual: number or measures below',
    'the listener position starts on DEFAULT_LISTENER, no room (the game\'s Sound quality: Low), which the built-in presets use; manual is last', list.loose.join(' | '));
  check(JSON.stringify(group('Automatic room, as recorded')) === JSON.stringify(['auto_set_c_room', 'auto_set_d_street'])
    && JSON.stringify(group('Automatic room: examples by shape')) === JSON.stringify(examples.map((k) => `auto_${k}`)) && examples.length === 14
    && JSON.stringify(group('Automatic room: places measured on 2Fort')) === JSON.stringify(list.places.map((k) => `place_${k}`)) && list.places.length === 5
    && JSON.stringify(group('A room the map sets by number')) === JSON.stringify([2, 3, 4, 5, 11, 17, 18, 21, 25, 26].map((n) => `room_${n}`)),
    'its groups: the two rooms as recorded, the 14 examples by shape, the five places on 2Fort, the ten numbers the soundscape scripts set',
    list.groups.map(([l, v]) => `${l} (${v.length})`).join(', '));
  // The lines under it.
  const lines = await page.evaluate(() => {
    const at = (key, water) => {
      els.position.value = key; els.underwater.checked = !!water; updateSignalChain();
      const ev = document.getElementById('room-evidence');
      return { detail: document.getElementById('room-detail').textContent, evidence: ev.hidden ? null : ev.textContent, room: renderOptions().room,
        water: renderOptions().underwater, mixer: [...document.querySelectorAll('#signal-chain li')].find((l) => l.querySelector('b').textContent === 'Mixer').textContent };
    };
    const out = { open: at('open'), water: at('open', true), recorded: at('auto_set_c_room'), example: at('auto_tunnel'), place: at('place_2fort_spawn_long'), number: at('room_17') };
    // The custom room (the app's own) and a number the table does not hold
    // (no room), through the manual number.
    const manualAt = (n, water) => { execCommand(`dsp_room ${n}`); els.underwater.checked = !!water; updateSignalChain(); const ev = document.getElementById('room-evidence');
      return { evidence: ev.hidden ? null : ev.textContent, text: ev.textContent, described: els.position.getAttribute('aria-describedby') }; };
    out.custom = manualAt(99); out.unheld = manualAt(40); out.unheldWater = manualAt(40, true);
    at('open');
    return out;
  });
  // What a screen reader is given at the default: the position's own line
  // and no hidden sentence (the browser's computed description).
  {
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#listener_position' });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const described = (nodes[0].description && nodes[0].description.value) || '';
    await cdp.detach();
    check(/dsp_slow_cpu 1/.test(described) && !/water|recording|Room effects/.test(described),
      'at the default the listener position\'s accessible description is its own line only: nothing of the hidden water or room sentences', described);
  }
  check(lines.custom.evidence === 'The custom room is the app\'s own, not the game\'s: no recording can check it.'
    && lines.unheld.evidence === null && lines.unheld.text === '' && lines.unheld.described === 'room-detail'
    && /^Read from the game's code\. One recording under water/.test(lines.unheldWater.evidence || ''),
    'the custom room\'s line says it is the app\'s own; a number that renders no room has no line (under water, the water\'s)', lines.custom.evidence);
  check(lines.open.evidence === null && /dsp_slow_cpu 1/.test(lines.open.detail) && lines.open.room === null && lines.open.water === false
    && /no room$/.test(lines.open.mixer),
    'no room: no line about the recordings, the help names dsp_slow_cpu 1, the render is asked for no room', lines.open.detail);
  check(lines.water.evidence === 'Read from the game\'s code. One recording under water matches its level (0.77 of the direct voice) and its lack of tremolo.'
    && lines.water.room === null && lines.water.water === true && /under water$/.test(lines.water.mixer),
    'under water alone: its own line, and the render is asked for no room under water', lines.water.evidence);
  const evidence = 'Room effects follow the game\'s own code. The two rooms marked "as recorded" match recordings of the game in echo times and level, '
    + 'and room 6 matches a recording echo by echo. The 2Fort places use the measures the game printed there; the other shapes are examples. '
    + 'No room has been checked sample for sample yet.';
  check([lines.recorded, lines.example, lines.place, lines.number].every((l) => l.evidence === evidence),
    'with a room, the line about what the recordings show', lines.recorded.evidence);
  check(JSON.stringify(lines.recorded.room) === '{"auto":"set_c_room"}' && /room; size class 2; from presets 102 and 103; 41\/256 to the room/.test(lines.recorded.detail)
    && JSON.stringify(lines.example.room) === '{"auto":"tunnel"}' && /tunnel; size class 2; from presets 114 and 115; 72\/256 to the room/.test(lines.example.detail)
    && /^An example: indoors, 200 × 1000 × 150 units, reflectivity 0\.3/.test(lines.example.detail)
    && JSON.stringify(lines.place.room) === '{"auto":"2fort_spawn_long"}' && /^Measured by the game on ctf_2fort/.test(lines.place.detail)
    && JSON.stringify(lines.number.room) === '{"preset":17}' && /dsp_room 17 \(Concrete Small\): 26\/256/.test(lines.number.detail),
    'each choice asks the render for its room and says what the engine builds (shape, size class, the pair, the share)', lines.example.detail);
  // Manual: dsp_room 0 to 29 (1 the automatic room from six measures), 99,
  // any typed number; under water its own checkbox.
  await page.locator('#advanced-toggle').evaluate((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); });
  const manual = await page.evaluate(() => {
    const out = {};
    out.options = [...els.env.options].filter((o) => !o.dataset.typed).map((o) => o.value).join(',');
    out.one = els.env.querySelector('option[value="1"]').textContent;
    execCommand('dsp_room 1');
    out.autoShown = getComputedStyle(els.autoEnv).display !== 'none';
    out.position = els.position.value;
    els.autoWidth.value = '200'; els.autoLength.value = '1000'; els.autoHeight.value = '150'; els.autoRefl.value = '0.3';
    updateSignalChain();
    out.line = document.getElementById('env-detail').textContent;
    out.room = JSON.stringify(renderOptions().room);
    execCommand('dsp_auto_width 48'); execCommand('dsp_auto_length 400'); execCommand('dsp_auto_height 64'); execCommand('dsp_auto_reflectivity 0.4');
    out.duct = document.getElementById('env-detail').textContent;
    execCommand('dsp_room 40');
    out.typed = { value: els.env.value, line: document.getElementById('env-detail').textContent, room: JSON.stringify(renderOptions().room),
      console: document.getElementById('console-out').textContent.slice(-300) };
    execCommand('dsp_room 99');
    out.custom = { shown: getComputedStyle(els.customEnv).display !== 'none', room: renderOptions().room };
    execCommand('exec preset_modern');
    return out;
  });
  check(manual.options === [...Array(30).keys(), 99].join(',') && manual.one === '1: automatic (the map measures the room; give the measures)'
    && manual.autoShown && manual.position === 'manual',
    'manual: dsp_room 0 to 29 and 99, 1 reading "automatic (the map measures the room; give the measures)" and showing its six measures', manual.one);
  check(manual.line === 'The engine would build: tunnel; size class 2; from presets 114 and 115; 72/256 to the room.'
    && manual.room === '{"auto":{"sky":false,"width":200,"length":1000,"height":150,"reflectivity":0.3,"openSides":0}}'
    && /duct; size class 1; from presets 106 and 107; 51\/256 to the room/.test(manual.duct),
    'the six measures go to the render, with a line that says what the engine would build', manual.line);
  check(manual.typed.value === '40' && manual.typed.room === '{"preset":40}' && /the app does not have this room/.test(manual.typed.line)
    && /dsp_room 40: the app does not have this room/.test(manual.typed.console),
    'the console\'s dsp_room takes any whole number; one the table does not hold: "the app does not have this room"', manual.typed.line);
  check(manual.custom.shown && manual.custom.room && manual.custom.room.custom && manual.custom.room.custom.mix === 0.25,
    'dsp_room 99, the app\'s custom room, shows its three knobs and sends them');
  // Saved settings and share links: each old position lands as item 3 says.
  const links = await page.evaluate(() => {
    const out = {};
    for (const [pos, n] of Object.entries({ hallway: 22, small_room: 17, tunnel: 6, tunnel_big: 7, cavern: 24, hangar: 10, chamber: 19, metal: 4 })) {
      execCommand('exec preset_modern'); els.underwater.checked = true;
      history.replaceState(null, '', `#codec=steam&pos=${pos}`); applyHashConfig();
      out[pos] = els.position.value === 'manual' && els.env.value === String(n) && !els.underwater.checked
        && JSON.stringify(renderOptions().room) === `{"preset":${n}}` && renderOptions().underwater === false;
    }
    execCommand('exec preset_modern');
    history.replaceState(null, '', '#codec=steam&pos=water'); applyHashConfig();
    out.water = els.position.value === 'open' && els.underwater.checked && renderOptions().room === null && renderOptions().underwater === true;
    const cfg = collectConfig();
    out.saved = cfg.pos === 'open' && cfg.uw === '1';
    history.replaceState(null, '', '#codec=steam&pos=auto_great_hall&uw=1&dsp=1&aw=700&al=1300&ah=400&arefl=0.4&asky=0&aopen=0'); applyHashConfig();
    out.newLink = els.position.value === 'auto_great_hall' && els.underwater.checked && els.autoWidth.value === '700';
    // dsp_room 1 rendered no room before W3-17d: an old link with it and no
    // measures renders none; a new one carries its measures.
    history.replaceState(null, '', '#codec=steam&pos=manual&dsp=1'); applyHashConfig();
    out.oldAuto = els.position.value === 'open' && renderOptions().room === null;
    history.replaceState(null, '', '#codec=steam&pos=manual&dsp=1&asky=0&aw=200&al=1000&ah=150&aopen=0&arefl=0.3'); applyHashConfig();
    out.newAuto = els.position.value === 'manual' && JSON.stringify(renderOptions().room) === '{"auto":{"sky":false,"width":200,"length":1000,"height":150,"reflectivity":0.3,"openSides":0}}';
    execCommand('exec preset_modern'); execCommand('dsp_room 1');
    const saved = collectConfig();
    execCommand('exec preset_modern'); applyConfig(saved);
    out.savedAuto = els.position.value === 'manual' && renderOptions().room && typeof renderOptions().room.auto === 'object';
    history.replaceState(null, '', location.pathname);
    execCommand('exec preset_sewers');
    out.sewers = els.position.value === 'open' && els.underwater.checked
      && document.querySelector('.preset-btn[aria-pressed="true"]').dataset.preset === 'underwater'
      && /preset_sewers is now preset_underwater/.test(document.getElementById('console-out').textContent);
    execCommand('exec preset_spam');
    out.spam = els.position.value === 'auto_tunnel' && !els.underwater.checked;
    execCommand('exec preset_modern');
    return out;
  });
  check(Object.values(links).every(Boolean),
    'old share links: hallway, small_room, tunnel, tunnel_big, cavern, hangar, chamber, metal become manual with 22, 17, 6, 7, 24, 10, 19, 4; water becomes no room under water; manual dsp_room 1 without measures renders no room, as it did; new links keep their keys and measures',
    JSON.stringify(links));
  check(links.sewers && links.spam, 'the built-in preset that was "2fort sewers" is "under water" (exec preset_sewers answers with the new name); Mic Spam takes the automatic tunnel');
  // Every control classified: the extras fieldset holds exactly the extras,
  // and a variable's name is shown only where the game has it.
  const classified = await page.evaluate(({ game, pcs, extras, named }) => {
    const box = document.getElementById('extras');
    const inBox = [...box.querySelectorAll('select, input')].map((el) => el.id);
    const label = (id) => { const el = document.getElementById(id); return el && el.labels && el.labels[0]; };
    const cvar = (id) => { const l = label(id); return l ? [...l.querySelectorAll('.cvar')].map((c) => c.textContent).join(' ') : 'no label'; };
    return { legend: box.querySelector('legend').textContent, inBox, missing: [...game, ...pcs, ...extras].filter((id) => !document.getElementById(id)),
      wrongCvar: [...game, ...pcs, ...extras].filter((id) => cvar(id) !== (named[id] || '')).map((id) => `${id}: "${cvar(id)}"`),
      fullband: document.querySelector('#codec option[value="steam_48"]').textContent,
      miles: document.querySelector('#codec option[value="miles"]').textContent };
  }, { game: CONTROLS_GAME, pcs: CONTROLS_PCS, extras: CONTROLS_EXTRAS, named: CONTROLS_NAMED });
  check(/Extras: not in the game/.test(classified.legend) && classified.missing.length === 0
    && JSON.stringify([...classified.inBox].sort()) === JSON.stringify([...CONTROLS_EXTRAS].sort())
    && !classified.inBox.some((id) => CONTROLS_GAME.includes(id) || CONTROLS_PCS.includes(id)),
    'the fieldset "Extras: not in the game" holds exactly the order\'s extras, and none of the game\'s or the PCs\' controls', classified.inBox.join(', '));
  check(classified.wrongCvar.length === 0 && /not (in )?the game/.test(classified.fullband) && /not in TF2/.test(classified.miles),
    'a control shows a variable\'s name only if the game has that variable; the Fullband Opus option says it is not in the game, the vaudio_miles option that it is not in TF2',
    classified.wrongCvar.join('; ') || `${classified.fullband}; ${classified.miles}`);
  // The labels of item 5.
  const labels5 = await page.evaluate(() => ({ avg: document.querySelector('label[for="avggain"]').textContent.replace(/\s+/g, ' ').trim(),
    agc: document.querySelector('#agc option[value="1"]').textContent }));
  check(labels5.avg === 'Gain target: mean (0) to peak (1) voice_avggain' && labels5.agc === 'On (the game\'s rule)',
    'the labels: "Gain target: mean (0) to peak (1)" with voice_avggain; the auto-gain "On (the game\'s rule)"', `${labels5.avg}; ${labels5.agc}`);
  // A render with each group's first entry plays and downloads with its tail.
  await page.locator('#file').setInputFiles({ name: 'room-tone.wav', mimeType: 'audio/wav', buffer: wavTone(0.5) });
  await page.waitForFunction(() => state.sourceName === 'room-tone.wav' && !els.process.disabled);
  for (const [key, setup] of [['open'], ['auto_set_c_room'], ['auto_closet'], ['place_2fort_spawn_room'], ['room_2'], ['manual', 'dsp_room 1']]) {
    await page.evaluate(([k, cmd]) => { execCommand('exec preset_modern'); execCommand(`listener_position ${k}`); if (cmd) execCommand(cmd); }, [key, setup]);
    await renderNow(page);
    const got = await page.evaluate(async () => {
      const a = els.audio;
      if (!(a.duration > 0)) await new Promise((r) => a.addEventListener('loadedmetadata', r, { once: true }));
      a.muted = true; await a.play(); await new Promise((r) => setTimeout(r, 150));
      const played = a.currentTime; a.pause(); a.currentTime = 0; a.muted = false;
      const info = state.lastCodecInfo.room || null;
      return { length: state.processedBuffer.length, rate: state.processedRate, source: Math.round(state.decodedSource.length * state.processedRate / state.decodedSource.sampleRate),
        duration: a.duration, played, room: info && { shares: info.shares, tail: info.tail, auto: info.auto, preset: info.preset } };
    });
    const wav = await readRenderedWav(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const saved = fs.readFileSync(await download.path());
    const tail = got.length - got.source;
    const roomed = key !== 'open';
    check(wav.frames === got.length && saved.length === 44 + 2 * got.length && saved.equals(Buffer.from(await page.evaluate(async () => [...new Uint8Array(await state.lastWav.arrayBuffer())])))
      && Math.abs(got.duration - got.length / got.rate) < 0.01 && got.played > 0
      && (roomed ? got.room && got.room.tail > 0 && tail === Math.round(got.room.tail * got.rate / 44100) : !got.room && tail === 0),
      `${key}${setup ? ` (${setup})` : ''}: the render plays, and it and its download carry ${roomed ? 'the room\'s tail' : 'no tail'}`,
      `${got.length} samples, ${tail} of them tail${got.room ? `, ${got.room.shares.room}/${got.room.shares.direct}` : ''}`);
  }
  await page.evaluate(() => execCommand('exec preset_modern'));
}

// W3-17d: the live chain's room. The live monitor's worker, started at
// 44.1 kHz (no device stage) with its tests-only probe, logs the voice at
// its mix point (the gain's output) and every call on its room path. Here
// the mix is made again from that voice alone, independently of audio.js:
// each sample as a 16-bit value, entered by the module's law
// (TF2Room.entry) at 256 with no room, or at the shares a room path run by
// hand gives for its block, each part upsampled by the engine's rule written
// here, the hand-run path's sum, the clip. The worker's own output must be
// that, sample for sample. The voice: noise bursts of 1.2 s every 2 s, so
// the 0.8 s pauses end each talk spurt (Steam's hold is 0.4 s).
async function verifyLiveRoom(page) {
  console.log('\n[Browser 3f2] The room in the live chain (W3-17d)');
  const run = (spec) => page.evaluate(async ({ codec, first, steps, seconds, queue = false }) => {
    const rate = 44100, block = 882;
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const total = rate * seconds, mic = new Float32Array(total);
    for (let i = 0; i < total; i++) mic[i] = (i / rate) % 2 < 1.2 ? 0.3 * (2 * rnd() - 1) : 0.0003 * (2 * rnd() - 1);
    const worker = new Worker('live-worker.js'), channel = new MessageChannel();
    const outs = [], readies = [], latencies = [];
    let probe = null;
    channel.port1.onmessage = (e) => { if (e.data.type === 'out') outs.push(new Float32Array(e.data.samples)); };
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') readies.push(e.data);
      if (e.data.type === 'stats') latencies.push(e.data.stats.latencyMs);
      if (e.data.type === 'roomprobe') probe = e.data;
    };
    // The monitor's own timing, as live.js's liveOptions() sends it with the
    // queue's switch off (W3-02c-3a); with `queue` the game's voice queue at
    // 300 frames a second and voice_buffer_ms 100, as it sends them with the
    // switch on at the page's defaults (W3-02c-3b).
    const timing = queue ? { timeline: 'game', fps: 300, bufferMs: 100 } : { timeline: 'source', fps: undefined, bufferMs: undefined };
    const opts = { ...renderOptions(), ...timing, codec, volume: 1, ...first, roomProbe: true, seed: 11 };
    const heard = () => outs.reduce((n, o) => n + o.length, 0);
    const until = async (f) => { const t = performance.now(); while (!f() && performance.now() - t < 30000) await new Promise((r) => setTimeout(r, 20)); };
    let fed = 0;
    const feedTo = async (seconds) => {
      const to = Math.round(seconds * rate);
      for (; fed < to; fed += block) { const b = mic.slice(fed, Math.min(to, fed + block)); channel.port1.postMessage({ type: 'in', samples: b.buffer }, [b.buffer]); }
      fed = to;
      // The chain's hold: about 0.21 s on steam, 0.56 s on its queue at 300 frames a second.
      await until(() => heard() >= fed - rate * (queue ? 0.6 : codec === 'steam' ? 0.3 : 0.1));
    };
    worker.postMessage({ type: 'start', rate, port: channel.port2, opts }, [channel.port2]);
    await until(() => readies.length > 0);
    for (const [at, change] of steps) {
      await feedTo(at);
      worker.postMessage({ type: 'config', opts: { ...opts, ...change } });
      await new Promise((r) => setTimeout(r, 150));
    }
    await feedTo(seconds);
    await new Promise((r) => setTimeout(r, 250));
    worker.postMessage({ type: 'roomprobe' });
    await until(() => probe);
    worker.terminate();
    // The mix made again from the voice at the mix point.
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[CODEC_PROFILES[codec].voiceRate], per = 512 >> stages;
    const voice = [];
    for (const g of probe.gain) for (const v of g) {
      let r = Math.round(v * 32768);
      if (Math.abs(v * 32768 - Math.trunc(v * 32768)) === 0.5) r = 2 * Math.round(v * 32768 / 2);
      voice.push(Math.max(-32768, Math.min(32767, r)));
    }
    const directState = Array.from({ length: stages }, () => ({ prev: 0 })), roomState = Array.from({ length: stages }, () => ({ prev: 0 }));
    const up = (e, states) => {
      for (const st of states) {
        const y = [];
        for (const x of e) { y.push((st.prev + x) >> 1, x); st.prev = x; }
        e = y;
      }
      return e;
    };
    const mix = [];
    const sets = [];
    let next = 0, hand = null, share = null, sharesSeen = [], spurts = 0, setAt = [], attach = [], detach = [], blocks = 0, current = null;
    const add = (y) => { for (const v of y) mix.push(v); };
    const dryTo = (to) => { if (to > next) { add(up(voice.slice(next, to).map((v) => TF2Room.entry(v, 256)), directState)); next = to; } };
    for (const c of probe.log) {
      if (c.call === 'create') hand = TF2Room.createRoomPath({ seed: c.seed, room: c.room, water: c.water, table: TF2_ROOM_PRESETS });
      else if (c.call === 'set') { setAt.push(blocks); sharesSeen.push('set'); sets.push({ preset: c.preset, fading: hand.state().room.fading }); if (c.preset !== undefined) hand.setRoom(c.preset); hand.setWater(c.water); }
      else if (c.call === 'spurtStart') { spurts++; sharesSeen.push('spurt'); hand.spurtStart(); }
      else if (c.call === 'attach') { attach.push(c.at); dryTo(c.at); }
      else if (c.call === 'detach') { detach.push(c.at); next = Math.max(next, c.at); }
      else if (c.call === 'block') { dryTo(c.at); current = c.at; }
      else if (c.call === 'shares') { share = hand.shares(); sharesSeen.push(share.room); }
      else if (c.call === 'process') {
        const v = voice.slice(current, current + per);
        while (v.length < per) v.push(0);
        const y = hand.process(Int32Array.from(up(v.map((x) => TF2Room.entry(x, share.direct)), directState)),
          Int32Array.from(up(v.map((x) => TF2Room.entry(x, share.room)), roomState)));
        add(y);
        next = current + per;
        blocks++;
      }
    }
    dryTo(voice.length);
    const out = [];
    for (const o of outs) for (const v of o) out.push(v);
    const m = Math.min(mix.length, out.length);
    let same = 0;
    for (let i = 0; i < m; i++) if (Math.max(-32767, Math.min(32767, mix[i])) / 32768 === out[i]) same++;
    const loud = (at) => voice.slice(Math.max(0, at - 4410), at).some((v) => Math.abs(v) > 300);
    return { blocks, same, m, mixLength: mix.length, outLength: out.length, readies: readies.map((r) => r.room), spurts, senderSpurts: probe.stats.spurts, opens: probe.stats.opens,
      sharesSeen, setAt, attach, detach, attachLoud: attach.map(loud), latencies, final: { holding: probe.holding, attached: probe.attached, latencyMs: probe.stats.latencyMs },
      state: probe.state, created: probe.log.find((c) => c.call === 'create'), sets };
  }, spec);
  const hold = 1000 * 511 / 44100;
  // steam: no room at the start, a room switched on mid-spurt, the great
  // hall mid-spurt, then none.
  const steam = await run({ codec: 'steam', first: { room: null, underwater: false }, seconds: 7,
    steps: [[1.0, { room: { preset: 6 } }], [3.0, { room: { auto: 'great_hall' } }], [5.0, { room: null }]] });
  check(steam.m > 0.9 * steam.mixLength && steam.same === steam.m && steam.blocks > 100,
    'steam live: the worker\'s output is the mix made again from its voice alone: the entries at the module\'s shares, each part upsampled, the room path by hand, the clip',
    `${steam.same} of ${steam.m} samples, ${steam.blocks} blocks through the room`);
  check(steam.readies.length === 1 && steam.attach.length === 1 && steam.attachLoud[0] && steam.detach.length === 1 && steam.detach[0] > steam.attach[0],
    'from no room, a room switched on mid-spurt and off again: one chain throughout (Steam\'s sender and the gain run on), the path run from the next block and let go after its fade to none',
    `${steam.readies.length} chain, attached at voice sample ${steam.attach[0]}, let go at ${steam.detach[0]}`);
  // After the great hall is taken (mid-spurt) the shares stay preset 6's
  // until the next spurt starts.
  const seen = steam.sharesSeen, hall = seen.indexOf('set', seen.indexOf('set') + 1), firstNew = seen.indexOf(41, hall);
  const lastOld = seen.lastIndexOf(26, firstNew), oldRun = seen.slice(hall, firstNew).filter((v) => v === 26).length;
  check(steam.spurts === steam.senderSpurts && steam.spurts >= 3 && hall > 0 && firstNew > hall && seen.slice(lastOld, firstNew).includes('spurt') && oldRun > 40,
    'a voice channel starts at each talk spurt and nowhere else, and a new room\'s shares come with the next spurt, not at once',
    `${steam.spurts} spurt starts for ${steam.senderSpurts} spurts; 26/256 for ${oldRun} blocks after the hall, then 41/256 after a spurt start`);
  check(Math.abs(Math.max(...steam.latencies) - steam.final.latencyMs - hold) < 1e-6 && !steam.final.holding && !steam.final.attached,
    'stats.latencyMs counts the room\'s 11.6 ms only while the chain holds a block: none once the room has faded to none',
    `${Math.max(...steam.latencies).toFixed(2)} ms with the room, ${steam.final.latencyMs.toFixed(2)} ms after`);
  // W3-02c-3b: the same on the game's voice queue, as the page sends it with
  // the queue's switch on. A channel starts at each open of the voice
  // channel, not at each of the sender's spurts: at 300 frames a second the
  // signal's 0.8 s pauses do not all free the channel.
  const queued = await run({ codec: 'steam', queue: true, first: { room: null, underwater: false }, seconds: 7,
    steps: [[1.0, { room: { preset: 6 } }], [3.0, { room: { auto: 'great_hall' } }], [5.0, { room: null }]] });
  check(queued.m > 0.9 * queued.mixLength && queued.same === queued.m && queued.blocks > 100 && queued.readies.length === 1,
    'steam live on the game\'s voice queue: the worker\'s output is the mix made again from its voice alone, one chain throughout',
    `${queued.same} of ${queued.m} samples, ${queued.blocks} blocks through the room`);
  check(queued.spurts === queued.opens && queued.opens >= 1 && queued.opens < queued.senderSpurts,
    'on the game\'s voice queue a voice channel starts at each open of the channel and nowhere else, not at each of the sender\'s spurts',
    `${queued.spurts} spurt starts for ${queued.opens} opens and ${queued.senderSpurts} spurts`);
  // celt_22 (the frame path, a 22050 Hz voice): started under water with a
  // number the table does not hold; preset 17; then that number again,
  // which leaves preset 17, with the water off.
  const celt = await run({ codec: 'celt_22', first: { room: { preset: 40 }, underwater: true }, seconds: 4.5,
    steps: [[1.5, { room: { preset: 17 }, underwater: true }], [3.0, { room: { preset: 40 }, underwater: false }]] });
  check(celt.created.water === true && celt.created.room === null && celt.attach[0] === 0 && celt.m > 0.9 * celt.mixLength && celt.same === celt.m
    && celt.readies.length === 1 && celt.state.room.preset === 17 && celt.state.water.on === false && celt.spurts === celt.senderSpurts,
    'celt_22 live: started under water with dsp_room 40 (under water, no room), then preset 17, then 40 again (the room stays 17) and the water off: the mix made again, sample for sample',
    `${celt.same} of ${celt.m} samples, ${celt.blocks} blocks, room ${celt.state.room.preset}`);
  // Preset 6, none, and before the fade to none has ended dsp_room 40 (not
  // held): the room still fades to none, and then the path is let go.
  const late = await run({ codec: 'celt_22', first: { room: { preset: 6 }, underwater: false }, seconds: 3,
    steps: [[1.0, { room: null }], [1.15, { room: { preset: 40 } }]] });
  check(late.sets.some((x) => x.preset === 40 && x.fading) && late.m > 0.9 * late.mixLength && late.same === late.m && late.detach.length === 1 && !late.final.attached && !late.final.holding
    && late.state.room.preset === null && Math.abs(Math.max(...late.latencies) - late.final.latencyMs - hold) < 1e-6,
    'none, then dsp_room 40 during the fade: the room fades to none and the path is let go (no 11.6 ms kept for the session)',
    `let go at voice sample ${late.detach[0]}; ${late.final.latencyMs.toFixed(2)} ms after`);
  // A rebuild for another setting keeps the path, its room and its count.
  const rebuilt = await run({ codec: 'steam', first: { room: { preset: 6 }, underwater: false }, seconds: 3,
    steps: [[1.0, { room: { preset: 6 }, micGain: 1.5 }]] });
  check(rebuilt.readies.length === 2 && rebuilt.readies.every(Boolean) && rebuilt.state.room.preset === 6 && rebuilt.state.count >= 2 * 44100,
    'a rebuild for another setting keeps the room path: its room and its count of blocks run on', `room ${rebuilt.state.room.preset}, ${rebuilt.state.count} samples`);
}

// W4-01d: the settings' words. The test walks the settings panel and
// carries no list of ids, so a control added later without help fails it.
async function verifySettingsWords(page) {
  console.log('\n[Browser 3c5] The settings\' words (W4-01d)');
  const words = await page.evaluate(() => {
    const panel = document.getElementById('controls-wrapper');
    const controls = [...panel.querySelectorAll('select, input')];
    const helpOf = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id));
    const labelText = (el) => (el.labels && el.labels[0] ? el.labels[0].textContent.replace(/\s+/g, ' ').trim() : '');
    const firstSentence = (t) => t.split(/(?<=[a-z0-9)%])\. /)[0].replace(/\.$/, '');
    const dynamic = ['listener_position', 'env', 'vad_threshold'];
    const sharedBy = { 'auto-help': ['a_sky', 'a_w', 'a_l', 'a_h', 'a_open', 'a_refl'], 'custom-help': ['c_dur', 'c_dec', 'c_mix'] };
    return {
      count: controls.length,
      noHelp: controls.filter((el) => { const h = helpOf(el); return !h.length || h.some((x) => !x) || h[0].textContent.trim().length < 20; }).map((el) => el.id),
      // Each control's sentence is its own: no other control points at it,
      // but for the two groups that share one sentence by design.
      shared: controls.filter((el) => {
        const h = helpOf(el)[0];
        if (!h) return false;
        const group = Object.entries(sharedBy).find(([, ids]) => ids.includes(el.id));
        const users = controls.filter((o) => helpOf(o)[0] === h).map((o) => o.id);
        return group ? h.id !== group[0] || users.some((id) => !group[1].includes(id)) : users.length > 1;
      }).map((el) => `${el.id} -> ${helpOf(el)[0].id}`),
      long: controls.map((el) => helpOf(el)[0]).filter((h) => h && !h.id.match(/^(room-detail|env-detail)$/)
        && h.textContent.split(/(?<=\.) /).some((x) => x.length > 115)).map((h) => h.id),
      measured: [...document.querySelectorAll('option')].filter((o) => /\(measured\)/.test(o.textContent)).map((o) => o.textContent),
      labels: controls.map(labelText),
      // The console's help says what the page says: each linked command's
      // help holds the first sentence of its control's help.
      console: controls.filter((el) => idToCvarMap[el.id] && !dynamic.includes(el.id) && helpOf(el)[0])
        .filter((el) => !cvars[idToCvarMap[el.id]].help.includes(firstSentence(helpOf(el)[0].textContent.trim())))
        .map((el) => `${idToCvarMap[el.id]}: "${firstSentence(helpOf(el)[0].textContent.trim())}"`),
      table: Object.fromEntries(['codec', 'warble_on', 'capture_channel', 'gain', 'bits', 'frameMs', 'loss', 'jitter', 'timeline', 'fps', 'buffer_ms', 'maxgain', 'voice_scale', 'volume', 'hp', 'lp']
        .map((id) => [id, [labelText(document.getElementById(id)), (helpOf(document.getElementById(id))[0] || { textContent: '' }).textContent.trim()]])),
      options: Object.fromEntries(['codec', 'warble_on', 'capture_channel', 'timeline'].map((id) => [id, [...document.getElementById(id).options].map((o) => o.textContent)]))
    };
  });
  check(words.count >= 30 && words.noHelp.length === 0,
    'every select and input of the settings panel has aria-describedby naming a sentence of at least 20 characters', `${words.count} controls${words.noHelp.length ? `; without: ${words.noHelp.join(', ')}` : ''}`);
  check(words.shared.length === 0, 'each control\'s sentence is its own; only the six measures share one, and the custom room\'s three knobs another',
    words.shared.join(', '));
  check(words.long.length === 0, 'each sentence of help is at most about 110 characters (115)', words.long.join(', '));
  check(words.measured.length === 0, 'no option text says "(measured)"', words.measured.join(', '));
  const dup = words.labels.filter((l, i) => words.labels.indexOf(l) !== i);
  check(dup.length === 0 && words.labels.every(Boolean), 'no two controls in the panel have the same label text', dup.join(', '));
  const t = words.table;
  // W3-20b put the codec menu's entries in two groups, the game's first, and
  // added vaudio_miles to the second, so the help names the first group.
  check(t.codec[0] === 'Voice codec sv_voicecodec' && t.codec[1] === 'What the game sends voice with. Steam voice is today\'s; the rest of the first group are its older codecs.'
    && JSON.stringify(words.options.codec) === JSON.stringify(['Steam voice (Opus, 32 kbps)', 'vaudio_celt (CELT, 22 kHz)', 'vaudio_celt_high (44 kHz mode)', 'vaudio_speex (Speex, 11 kHz)',
      'Fullband Opus: not in the game', words.options.codec[5]]) && /^vaudio_miles: not in TF2/.test(words.options.codec[5])
    && t.warble_on[0] === 'Skip the codec' && JSON.stringify(words.options.warble_on) === '["Off","On"]'
    && t.warble_on[1] === 'For comparison only: the sound goes to the receiver without being coded.'
    && t.capture_channel[0] === 'Channel of a stereo file' && words.options.capture_channel[0] === 'Left'
    && t.capture_channel[1] === 'Which channel the game\'s microphone gets. Left is what one stereo cable gave it; a mono file is not affected.'
    && t.gain[1] === 'Loudness into the game. Above 1 the sender clips, as an overdriven microphone does.'
    && t.bits[0] === 'Bitrate, in sixteenths' && t.bits[1] === '16 is the codec\'s own bitrate; 8 is half of it. vaudio_speex and vaudio_miles each have one bitrate and ignore this.'
    && t.frameMs[0] === 'Frames per packet, as ms' && t.frameMs[1] === 'How much voice one network packet carries. A lost packet loses all of it. Steam voice sends each of its messages as one packet and ignores this.'
    && t.loss[0] === 'Packets lost % net_fakeloss' && t.loss[1] === 'The share of voice packets that never arrive. Not the game\'s own number: its net_fakeloss 5 loses about 22% of them.'
    // BC-4a: jitter on Steam voice is when packets reach the game's voice queue.
    && t.jitter[1] === 'How far packets\' arrival times spread. On Steam voice it acts only through the game\'s voice queue: packets arrive later and in bunches; none is lost. '
      + 'On the file\'s own timing, and so for a video or a demo\'s voice, it does nothing.'
    // W3-02d-1: Phrase timing and the game's voice queue's two settings.
    && t.timeline[0] === 'Phrase timing' && JSON.stringify(words.options.timeline) === '["The game\'s voice queue","The file\'s own timing"]'
    && t.timeline[1] === 'The game queues each voice, so a phrase after a short pause can start early. It can come early by up to about the wait, and the sound runs 0.04% fast. '
      + 'At 300 frames a second a sound that opens the queue loses short pieces in its first seconds. '
      + 'Which phrases move depends on the sender\'s clock, which no recording shows. The file\'s own timing keeps every sound where the source has it. The live monitor always keeps the file\'s own timing.'
    && t.fps[0] === 'Listener\'s frame rate fps_max' && t.fps[1] === 'How many frames a second the listener\'s game draws. A new phrase waits before it plays, longer at a higher rate: about 0.09 s at 67 and 0.44 s at 300. '
      + 'The game\'s fps_max caps the rate; 300 is its default. At 200 or less, sound that never pauses for minutes thins out; at 67 the level first dips after about 2 minutes. '
      + 'That is the game\'s rule as read, run on the model; no recording shows it.'
    && t.buffer_ms[0] === 'Voice buffer ms voice_buffer_ms' && t.buffer_ms[1] === 'The wait before a new phrase plays, in milliseconds. The game counts it down one frame at a time, so it lasts longer at a higher frame rate. The game\'s default is 100.'
    && t.maxgain[1] === 'The most the receiver\'s auto-gain may amplify. The game\'s default is 10.'
    && t.voice_scale[1] === 'The game\'s voice_scale. Not a plain volume: below 1 it lowers the voice by more than its number.'
    && t.volume[1] === 'The game\'s volume setting; it sets the loudest the file can get. 1.0 is the game\'s default. The recordings behind the model were made at 0.15.'
    && t.hp[1] === 'Not in the game: a filter before the codec. 0 is off.' && t.lp[1] === 'Not in the game: a filter before the codec. 20000 is off.',
    'the labels, options and sentences the audit settled are on the page', JSON.stringify(t.codec));
  check(words.console.length === 0, 'each command\'s console help says what the page says under its control', words.console.join('; '));
  // The chain strip names what it left out.
  const strip = await page.evaluate(() => {
    const receiver = () => [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Receiver').textContent;
    execCommand('exec preset_modern');
    const plain = receiver();
    execCommand('voice_scale 0.5');
    const scaled = receiver();
    execCommand('voice_avggain 0.25');
    const both = receiver();
    execCommand('exec preset_modern');
    return { plain, scaled, both };
  });
  check(!/voice_scale|gain target/.test(strip.plain) && strip.scaled.includes('voice_scale 0.5') && strip.both.includes('voice_scale 0.5') && strip.both.includes('gain target 0.25'),
    'the chain strip\'s Receiver cell holds "voice_scale 0.5" after that setting, and the gain target when voice_avggain is not 0.5', `${strip.plain} | ${strip.both}`);
  // At 390 px the codec's chosen text fits its box, for every option (with
  // 20 px left for the menu's arrow).
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const fit = await page.evaluate(() => {
    const select = document.getElementById('codec'), was = select.value, style = getComputedStyle(select);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
    const out = [...select.options].map((o) => { select.value = o.value; return [o.textContent, Math.ceil(ctx.measureText(select.selectedOptions[0].textContent).width)]; });
    select.value = was;
    return { room, out };
  });
  await page.setViewportSize(viewport);
  check(fit.out.every(([, w]) => w <= fit.room), 'at 390 px the codec\'s chosen text fits its box for every option',
    `${fit.out.map(([t, w]) => `${w}`).join(', ')} px of ${fit.room}`);
}

// W4-01a: the journey. A file renders by itself and the result comes into
// view; a changed setting renders by itself (a minute or less) or marks the
// result (longer); a re-render keeps the place; presets are lit by matching
// and the line under them says what differs; settings are remembered; the
// words; the version line. Each in a page of its own, on fresh storage.
const STALE_TEXT = 'These settings are not rendered yet. What you see and hear was made with the earlier ones.';
// The rendered WAV's SHA-256, as hex.
const wavHash = (page) => page.evaluate(async () => {
  const bytes = await (await fetch(document.getElementById('preview').src)).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
});
// A control of the settings set by its own control, as a user does (the
// advanced controls opened first when it is one of them).
async function setControl(page, id, value) {
  await page.evaluate((id) => { if (document.getElementById(id).closest('.advanced-control') && !document.body.classList.contains('advanced')) showAdvanced(true); }, id);
  const el = page.locator(`#${id}`);
  if (await el.evaluate((e) => e.tagName === 'SELECT')) await el.selectOption(String(value));
  else { await el.fill(String(value)); await el.dispatchEvent('change'); }
}
// How many renders have started since `mark` was logged.
const rendersStartedSince = (page, mark) => page.evaluate((m) => {
  const lines = [...document.getElementById('console-out').children].map((e) => e.textContent);
  return lines.slice(lines.lastIndexOf(m) + 1).filter((l) => l.startsWith('S_StartSound: initializing render')).length;
}, mark);

async function verifyJourney(browser, base) {
  console.log('\n[Browser 8] The journey (W4-01a): a file to its sound, changed settings, presets, memory, words, version');
  const errors = [];
  const fresh = async (viewport = { width: 1280, height: 720 }, options = {}) => {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport, ...options });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };

  // 1. A chosen file and nothing else: rendered, in view, focused, paused.
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 664 }]) {
    const { context, page } = await fresh(viewport);
    try {
      await page.locator('#file').setInputFiles({ name: 'first.wav', mimeType: 'audio/wav', buffer: wavSpeech(3) });
      await page.waitForFunction(() => state.renderId === 1 && renderIdle(), null, { timeout: 60000 });
      // The scroll may be smooth: wait until the page has stopped moving.
      await page.evaluate(() => new Promise((resolve) => {
        let last = -1, still = 0;
        const step = () => { const y = window.scrollY; still = y === last ? still + 1 : 0; last = y; if (still >= 10) resolve(); else requestAnimationFrame(step); };
        step();
      }));
      const seen = await page.evaluate(() => {
        const r = els.audio.getBoundingClientRect(), h = document.getElementById('step-listen').getBoundingClientRect();
        return { download: !els.dl.disabled, renders: state.renderId, box: [r.top, r.bottom, r.left, r.right].map(Math.round), height: window.innerHeight, width: window.innerWidth,
          focused: document.activeElement === els.audio, paused: els.audio.paused, scrolled: Math.round(window.scrollY), heading: Math.round(h.top) };
      });
      check(seen.download && seen.renders === 1 && seen.box[0] >= 0 && seen.box[1] <= seen.height && seen.box[2] >= 0 && seen.box[3] <= seen.width
        && seen.focused && seen.paused && seen.scrolled > 0 && Math.abs(seen.heading) <= 2,
        `${viewport.width} × ${viewport.height}: a chosen file renders by itself; step 3's heading comes to the top, the player is wholly in view, has the focus and does not play`,
        `player ${seen.box[0]}–${seen.box[1]} of ${seen.height} px, heading at ${seen.heading} px, page scrolled ${seen.scrolled} px`);
      if (viewport.width === 1280) {
        // Space plays it, from the player (the page's key, not twice).
        await page.keyboard.press(' ');
        await page.waitForFunction(() => !els.audio.paused, null, { timeout: 5000 }).catch(() => {});
        const playing = await page.evaluate(() => !els.audio.paused);
        await page.keyboard.press(' ');
        check(playing && await page.evaluate(() => els.audio.paused), 'Space on the focused player plays it, and Space again pauses it');
        // A render started with the button: the focus goes to the player too.
        await page.locator('#process').focus();
        await page.locator('#process').press('Enter');
        await page.waitForFunction(() => state.renderId === 2 && renderIdle(), null, { timeout: 60000 });
        check(await page.evaluate(() => document.activeElement === els.audio), 'after a render started with the button, the player has the focus');
      }
    } finally { await context.close(); }
  }

  const { context, page } = await fresh();
  try {
    // 2. A 10 s source: a changed setting renders by itself; three changes
    // within 300 ms give one render.
    await chooseFile(page, { name: 'ten.wav', mimeType: 'audio/wav', buffer: wavSpeech(10) });
    const first = await wavHash(page), r1 = await page.evaluate(() => state.renderId);
    await setControl(page, 'voice_scale', '0.5');
    await page.waitForFunction((r) => state.renderId === r + 1 && renderIdle(), r1, { timeout: 60000 });
    const second = await wavHash(page);
    check(second !== first, 'a 10 s source: voice_scale set to 0.5 by its control renders again with no press, and the WAV differs', `${first.slice(0, 12)} → ${second.slice(0, 12)}`);
    const mark = 'test: three changes';
    await page.evaluate((m) => logLine(m, 'sys'), mark);
    const r2 = await page.evaluate(() => state.renderId), t0 = Date.now();
    for (const v of ['0.6', '0.7', '0.8']) await page.evaluate((v) => { els.voiceScale.value = v; els.voiceScale.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    const spread = Date.now() - t0;
    await page.waitForFunction((r) => state.renderId > r && renderIdle(), r2, { timeout: 60000 });
    await page.waitForTimeout(600);
    check(spread < 300 && await page.evaluate(() => state.renderId) === r2 + 1 && await rendersStartedSince(page, mark) === 1
      && await page.evaluate(() => els.voiceScale.value === '0.8' && state.renderedKey === settingsKey()),
      'three changes within 300 ms give one render, of the last', `${spread} ms apart; ${await rendersStartedSince(page, mark)} render started`);

    // 3. A re-render keeps the place: position, playing, the version heard.
    // (A click first: the page has had a user's gesture, so it may play.)
    await page.locator('#ab-group [data-ab="wet"]').click();
    await page.evaluate(async () => {
      const a = els.audio;
      if (!(a.duration > 0)) await new Promise((r) => a.addEventListener('loadedmetadata', r, { once: true }));
      a.currentTime = 4;
      await a.play();
    });
    await page.locator('#ab-group [data-ab="dry"]').click();
    await page.waitForFunction(() => els.audio.currentTime > 4.3 && !els.audio.paused);
    // Where playback had got to when the new render takes the player's place.
    await page.evaluate(() => {
      const proto = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      window.__place = null; window.__restored = null;
      Object.defineProperty(els.audio, 'src', { configurable: true, get() { return proto.get.call(this); },
        set(v) { window.__place = { at: this.currentTime, playing: !this.paused };
          this.addEventListener('seeked', () => { window.__restored = this.currentTime; }, { once: true }); proto.set.call(this, v); } });
    });
    const r3 = await page.evaluate(() => state.renderId);
    await setControl(page, 'voice_scale', '0.9');
    await page.waitForFunction((r) => state.renderId === r + 1 && window.__restored !== null && !els.audio.paused, r3, { timeout: 60000 });
    await page.waitForTimeout(300);
    const place = await page.evaluate(() => ({ place: window.__place, restored: window.__restored, now: els.audio.currentTime, paused: els.audio.paused,
      mode: state.abMode, pressed: document.querySelector('#ab-group [aria-pressed="true"]').dataset.ab, dryMuted: els.audioDry.muted, wetMuted: els.audio.muted }));
    await page.evaluate(() => { delete els.audio.src; els.audio.pause(); });
    check(place.place && place.place.playing && Math.abs(place.restored - place.place.at) < 0.15 && !place.paused && place.now > place.restored,
      'a re-render while playing goes on playing from where playback had got to', `at ${place.place && place.place.at.toFixed(3)} s, on from ${place.restored && place.restored.toFixed(3)} s`);
    check(place.mode === 'dry' && place.pressed === 'dry' && !place.dryMuted && place.wetMuted, 'with "Original" chosen before the re-render, "Original" is chosen after');
    await page.locator('#ab-group [data-ab="wet"]').click();

    // 5. Presets lit by matching, the line under them, Reset.
    await page.locator('#preset-reset').click();
    await waitRendered(page);
    const presetState = () => page.evaluate(() => ({ lit: [...document.querySelectorAll('.preset-row .preset-btn[aria-pressed="true"]')].map((b) => b.dataset.preset),
      line: els.presetLine.hidden ? null : els.presetLine.textContent.replace(/\s+/g, ' ').trim() }));
    const atDefaults = await presetState();
    check(JSON.stringify(atDefaults.lit) === '["modern"]' && atDefaults.line === null, 'at the defaults Modern is lit and the line under the presets is hidden', JSON.stringify(atDefaults));
    const typed = async (command) => { await page.locator('#console-input').fill(command); await page.locator('#console-input').press('Enter'); };
    await page.locator('#console-details summary').click();
    await typed('voice_scale 0.5');
    const scaled = await presetState();
    check(scaled.lit.length === 0 && /^Modern, changed: Voice scale 0\.5 · Reset$/.test(scaled.line),
      'voice_scale 0.5 from the console: no preset is lit, and the line names Voice scale and 0.5', scaled.line);
    await typed('voice_scale 1');
    await typed('net_fakeloss 18');
    check((await presetState()).lit.length === 0, 'Laggy\'s loss alone lights nothing');
    await typed('net_fakejitter 50');
    const laggy = await presetState();
    check(JSON.stringify(laggy.lit) === '["laggy"]' && /^Laggy, as the preset sets it · Reset$/.test(laggy.line),
      'the console commands that set Laggy\'s values one by one light Laggy, with no click', laggy.line);
    await typed('volume 0.15');
    const laggyChanged = await presetState();
    check(laggyChanged.lit.length === 0 && /^Laggy, changed: Output volume 0\.15 · Reset$/.test(laggyChanged.line),
      'a change after that names the preset last lit and what differs from it', laggyChanged.line);
    // The preset that was "2fort sewers" lights by matching like any other.
    await typed('exec preset_modern');
    await typed('underwater 1');
    await typed('voice_micgain 2');
    check(JSON.stringify((await presetState()).lit) === '["underwater"]', 'under water and a mic gain of 2 light "Under water", with no click');
    // A preset sets every preset-set field: the manual room number and the
    // custom room's knobs too.
    await typed('dsp_room 99');
    await typed('dsp_custom_mix 60');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    const reset = await page.evaluate(() => ({ dsp: els.env.value, mix: els.cMix.value, pos: els.position.value }));
    check(reset.dsp === '0' && reset.mix === '25' && reset.pos === 'open', 'a preset click sets the manual room number and the custom room\'s knobs back too', JSON.stringify(reset));
    await typed('snd_device_rate 44100');
    const device = await presetState();
    check(JSON.stringify(device.lit) === '["modern"]' && /^Modern, also Listener's sound device 44100 Hz · Reset$/.test(device.line),
      'with the sound device at 44100 Hz Modern is still lit, and the line names the device after "also"', device.line);
    await typed('voice_scale 0.5');
    await typed('voice_capture_channel mix');
    const both = await presetState();
    check(/^Modern, changed: Voice scale 0\.5 · also (Channel of a stereo file Mix L\+R · Listener's sound device 44100 Hz|Listener's sound device 44100 Hz · Channel of a stereo file Mix L\+R) · Reset$/.test(both.line),
      'the line gives the preset-set changes, then the PC\'s after "also"', both.line);
    await page.locator('#preset-reset').click();
    const back = await page.evaluate(() => {
      const cfg = collectConfig();
      return { differ: Object.keys(DEFAULT_CONFIG).filter((k) => !sameSetting(k, cfg, DEFAULT_CONFIG)), raw: Object.keys(DEFAULT_CONFIG).filter((k) => cfg[k] !== DEFAULT_CONFIG[k]) };
    });
    const afterReset = await presetState();
    check(JSON.stringify(afterReset.lit) === '["modern"]' && afterReset.line === null && back.differ.length === 0 && back.raw.length === 0,
      '"Reset" lights Modern and every CONFIG_FIELDS value equals its default', back.raw.join(', ') || 'all at their defaults');
    const lists = await page.evaluate(() => ({ keys: CONFIG_FIELDS.map(([k]) => k), set: PRESET_SET_FIELDS, kept: KEPT_ACROSS_PRESETS,
      fields: [...new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p)))], mapped: Object.keys(PRESET_KEYS), targets: Object.values(PRESET_KEYS) }));
    const placed = lists.keys.map((k) => [k, lists.set.filter((x) => x === k).length + lists.kept.filter((x) => x === k).length]);
    check(placed.every(([, n]) => n === 1) && [...lists.set, ...lists.kept].every((k) => lists.keys.includes(k))
      && JSON.stringify(lists.kept) === '["uptime","dev","chan","fps"]',
      'every key of CONFIG_FIELDS is in exactly one of the two lists (set by a preset, or kept across presets: uptime, dev, chan, fps)',
      placed.filter(([, n]) => n !== 1).map(([k, n]) => `${k}: ${n}`).join(', ') || `${lists.keys.length} keys`);
    check(lists.fields.every((f) => lists.mapped.includes(f)) && lists.targets.every((k) => lists.set.includes(k)),
      'every field a built-in preset names maps to a preset-set key', lists.fields.join(', '));

    // 7. Words.
    await page.locator('#advanced-toggle').evaluate((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); });
    await page.locator('#reference summary').click();
    const visible = await page.evaluate(() => document.body.innerText);
    const found = ['Process Audio', '\\bWet\\b', '\\bDry\\b', 'int16'].filter((p) => new RegExp(p).test(visible));
    check(found.length === 0, 'no visible text says "Process Audio", "Wet", "Dry" or "int16" (every panel open)', found.join(', '));
    const wav = await readRenderedWav(page), status = await renderStatus(page);
    check(status.startsWith('Rendered in ') && status.includes(` at ${wav.rate.toLocaleString('en-US')} Hz `),
      'the render\'s status line says "Rendered in" and the rate the WAV\'s header has', `${status}; header ${wav.rate} Hz`);
    // The gate's part, only when the gate held frames: 1 s of speech, 2 s quiet.
    const gated = Buffer.concat([wavSpeech(1), Buffer.alloc(2 * 48000 * 2)]);
    gated.writeUInt32LE(gated.length - 8, 4); gated.writeUInt32LE(gated.length - 44, 40);
    await chooseFile(page, { name: 'gated.wav', mimeType: 'audio/wav', buffer: gated });
    const gate = await page.evaluate(() => ({ status: els.renderStatus.textContent, held: state.lastCodecInfo.gatedFrames * state.lastCodecInfo.frameMs / 1000 }));
    check(gate.held > 0.5 && gate.status.endsWith(` · ${gate.held.toFixed(2)} s not sent (too quiet for the gate)`),
      'with frames the gate held, the line ends with the time not sent', gate.status);
  } finally { await context.close(); }

  // 4. A 61 s source: a changed setting that needs a new encode waits for the
  // button, and the page says so. Jitter: on the engine's AFTER_A list, not
  // AFTER_B, so the page marks the render on every codec (BC-4 kept it off
  // AFTER_B, since the other codecs read it in the codec stage; on Steam
  // voice the engine then starts from the kept codec result, [Browser 8e]),
  // and it allows no first seconds, so the line under the player reads
  // "Rendering 61.0 s…" throughout. (W3-02d-2: a change on the receiver's side alone renders such a
  // source by itself, [Browser 8d].)
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'long.wav', mimeType: 'audio/wav', buffer: wavTone(61, 8000) }, 120000);
      const r = await page.evaluate(() => state.renderId), mark = 'test: the long source changed';
      await page.evaluate((m) => logLine(m, 'sys'), mark);
      await setControl(page, 'jitter', '50');
      await page.waitForTimeout(2000);
      const marks = () => page.evaluate(() => ({ status: els.renderStatus.textContent, button: els.process.textContent, download: els.dl.textContent,
        stale: ['viz-container', 'viz-legend', 'meter'].map((id) => document.getElementById(id).classList.contains('stale')), renders: state.renderId, processing: state.processing }));
      const waiting = await marks();
      check(waiting.renders === r && !waiting.processing && await rendersStartedSince(page, mark) === 0,
        'a 61 s source and a changed jitter: no render starts within 2 s', `${await rendersStartedSince(page, mark)} started`);
      check(waiting.status === STALE_TEXT && waiting.button === 'Render again' && waiting.download === 'Download WAV (earlier settings)' && waiting.stale.every(Boolean),
        'the status line, "Render again" and "(earlier settings)" say so, and the views and the table are marked stale', JSON.stringify(waiting));
      await setControl(page, 'jitter', '0');
      const back = await marks();
      check(back.renders === r && back.status !== STALE_TEXT && back.status.startsWith('Rendered in') && back.button === 'Render' && back.download === 'Download WAV' && !back.stale.some(Boolean),
        'the value set back removes the marks, with no render', JSON.stringify(back));
      await setControl(page, 'jitter', '50');
      await page.locator('#process').click();
      // While it renders: "Rendering… N%" and "Rendering 61.0 s…".
      await page.waitForFunction(() => /^Rendering… \d+%$/.test(els.process.textContent), null, { timeout: 30000 });
      const during = await page.evaluate(() => ({ button: els.process.textContent, status: els.renderStatus.textContent }));
      check(during.status === 'Rendering 61.0 s…', 'while it renders the button reads "Rendering… N%" and the line "Rendering 61.0 s…"', `${during.button}; ${during.status}`);
      await waitRendered(page, 120000);
      const done = await marks();
      check(done.renders === r + 1 && done.status.startsWith('Rendered in') && done.button === 'Render' && !done.stale.some(Boolean),
        'a press on "Render again" renders and removes the marks', done.status);
      // A steady tone: the gate held nothing, and the line says nothing of it.
      check(await page.evaluate(() => state.lastCodecInfo.gatedFrames === 0) && !done.status.includes('not sent'),
        'with no frames held by the gate, the line says nothing of it', done.status);
      // A change while it renders (review, S1): the render that comes is
      // labelled with the settings it was made with, so the page marks it.
      await setControl(page, 'jitter', '60');
      await page.locator('#process').click();
      await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
      await setControl(page, 'loss', '5');
      await waitRendered(page, 120000);
      const after = await marks();
      check(after.renders === r + 2 && after.status === STALE_TEXT && after.button === 'Render again' && after.stale.every(Boolean)
        && await page.evaluate(() => state.renderedKey !== settingsKey() && JSON.parse(state.renderedKey).lossPct === 0),
        'a 61 s source: a change made while it renders leaves that render marked as made with the earlier settings', after.status);
    } finally { await context.close(); }
  }

  // A change while a render runs, on a short source (review, S1): the render
  // for older settings stops or is followed by one for the controls', and
  // what is shown is what a render of the controls' settings gives. Since
  // W4-01b a render after a receiver's setting starts from the codec's result
  // and ends before the next change's 400 ms; Packets lost % renders from the
  // capture signal (about 1.4 s for 40 s), so the render is still running and
  // is stopped for the newer settings.
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'during.wav', mimeType: 'audio/wav', buffer: wavSpeech(40) }, 120000);
      const mark = 'test: a change while a render runs';
      await page.evaluate((m) => logLine(m, 'sys'), mark);
      await setControl(page, 'loss', '5');
      await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
      await setControl(page, 'loss', '10');
      await waitRendered(page, 120000);
      const stopped = await page.evaluate((m) => {
        const lines = [...document.getElementById('console-out').children].map((e) => e.textContent);
        return lines.slice(lines.lastIndexOf(m) + 1).filter((t) => t === 'S_StopSound: render stopped for newer settings.').length;
      }, mark);
      const shown = await wavHash(page), key = await page.evaluate(() => state.renderedKey === settingsKey() && !state.stale);
      await renderNow(page);
      const again = await wavHash(page), afresh = await freshHash(page);
      check(stopped === 1 && key && shown === again && shown === afresh, 'a short source: after a change made while a render runs, that render is stopped and the render shown is the controls\' settings\' (a render of them again, and one made afresh on the page\'s own thread, are the same WAV)',
        `${stopped} stopped; ${shown.slice(0, 12)} / ${again.slice(0, 12)} / ${afresh.slice(0, 12)}`);
      // The focus is not taken from a field being typed in (review, N5).
      await page.locator('#console-details summary').click();
      await page.evaluate(() => { window.__sourceBefore = state.decodedSource; });
      await page.locator('#file').setInputFiles({ name: 'typing.wav', mimeType: 'audio/wav', buffer: wavSpeech(10) });
      await page.locator('#console-input').focus();
      await page.keyboard.type('echo hi');
      await page.waitForFunction(() => state.decodedSource !== window.__sourceBefore && state.renderedSource === state.decodedSource && renderIdle(), null, { timeout: 60000 });
      check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'console-input',
        'a first render does not take the focus from a field being typed in');
    } finally { await context.close(); }
  }

  // A render that fails is not started again by itself (review, B1): the
  // Opus module cannot load (as offline before it is cached).
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.route('**/opus-codec.mjs', (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const mark = 'test: a render that fails';
      await page.evaluate((m) => logLine(m, 'sys'), mark);
      await page.locator('#file').setInputFiles({ name: 'fails.wav', mimeType: 'audio/wav', buffer: wavSpeech(3) });
      await page.waitForFunction(() => /^The render failed/.test(els.renderStatus.textContent) && !state.processing, null, { timeout: 30000 });
      await page.waitForTimeout(2500);
      const failed = await page.evaluate(() => ({ status: els.renderStatus.textContent, error: els.renderStatus.classList.contains('error'), processing: state.processing }));
      const starts = await rendersStartedSince(page, mark);
      check(starts === 1 && failed.error && /^The render failed/.test(failed.status) && !failed.processing,
        'a render that fails is not started again by itself; its error stays on screen', `${starts} started; ${failed.status}`);
      await page.locator('#process').click();
      await page.waitForFunction(() => !state.processing && /^The render failed/.test(els.renderStatus.textContent), null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      check(await rendersStartedSince(page, mark) === 2, 'the button tries it again, once', `${await rendersStartedSince(page, mark)} started`);
    } finally { await context.close(); }
  }

  // The owner's words (2026-11-11): one neutral name for the render, with
  // vaudio_miles as with Steam voice: "Rendered" on the switch, RENDER and
  // ORIGINAL in the table, no version labelled TF2.
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'words.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
      for (const codec of ['steam', 'miles']) {
        if (codec !== 'steam') { await page.locator('#codec').selectOption(codec); await page.waitForFunction(() => state.lastCodecKey === 'miles' && renderIdle(), null, { timeout: 60000 }); }
        await page.waitForFunction(() => document.querySelectorAll('#meter-rows tr').length >= 2 && !document.getElementById('meter-rows').textContent.includes('…'), null, { timeout: 60000 });
        const labels = await page.evaluate(() => ({ hear: [...document.querySelectorAll('#ab-group .ab-choice')].filter((b) => !b.hidden).map((b) => b.textContent),
          group: document.getElementById('ab-label').textContent, rows: [...document.querySelectorAll('#meter-rows tr th')].map((t) => t.textContent),
          // (the real take's button, hidden here, is a recording of TF2 and says so)
          titles: [...document.querySelectorAll('#ab-group .ab-choice, #meter-rows tr')].filter((e) => !e.hidden).map((e) => e.title || '').join(' | '),
          legend: document.getElementById('viz-legend').textContent, now: document.getElementById('ab-now').textContent, key: state.lastCodecKey }));
        const tf2 = [...labels.hear, ...labels.rows, labels.titles, labels.legend, labels.now].filter((t) => /TF2/.test(t));
        check(labels.key === codec && JSON.stringify(labels.hear) === '["Rendered","Original"]' && labels.group === 'Hear (B):'
          && labels.rows[0] === 'RENDER' && labels.rows[1] === 'ORIGINAL' && labels.now === 'Hearing the render' && tf2.length === 0,
          `with ${codec}: the switch reads "Hear (B): Rendered | Original", the table RENDER and ORIGINAL, and no version is labelled TF2`,
          `${labels.hear.join(' | ')}; ${labels.rows.join(', ')}${tf2.length ? `; TF2 in: ${tf2.join(' / ')}` : ''}`);
      }
    } finally { await context.close(); }
  }

  // 8. Remembered settings.
  {
    const { context, page } = await fresh();
    try {
      await setControl(page, 'voice_scale', '0.5');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const kept = await page.evaluate(() => ({ vs: els.voiceScale.value, advanced: document.body.classList.contains('advanced'), line: els.presetLine.hidden ? null : els.presetLineText.textContent }));
      check(kept.vs === '0.5' && kept.advanced && /Voice scale 0\.5/.test(kept.line || ''), 'a changed setting survives a reload, as does the open advanced panel, and the line says what is not the default', JSON.stringify(kept));
      await page.goto(`${base}/#vs=0.75`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      check(await page.evaluate(() => els.voiceScale.value) === '0.75', 'a share link\'s value wins over the remembered one');
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('tf2ve_settings', JSON.stringify('x')));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const junk = await page.evaluate(() => Object.keys(DEFAULT_CONFIG).filter((k) => collectConfig()[k] !== DEFAULT_CONFIG[k]));
      check(junk.length === 0, 'with tf2ve_settings holding "x" the page boots on its defaults', junk.join(', '));
      // W3-02c-3b: the live monitor's switch for the game's voice queue is
      // off on load and after a reload made with it on; it is in no
      // remembered setting and no share link (both are collectConfig()'s),
      // and has no console name.
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const queueBox = async () => {
        await page.evaluate(() => { if (!document.body.classList.contains('advanced')) showAdvanced(true); });
        const box = page.locator('#live-queue');
        const was = await box.isChecked();
        const config = await page.evaluate(() => ({ config: JSON.stringify(collectConfig()), saved: localStorage.getItem('tf2ve_settings') }));
        await box.check();
        const after = await page.evaluate(() => ({ config: JSON.stringify(collectConfig()), saved: localStorage.getItem('tf2ve_settings'), hash: location.hash,
          named: Object.keys(idToCvarMap).includes('live-queue') }));
        return { was, same: config.config === after.config, savedSame: after.saved === null || after.saved === after.config, hash: after.hash, named: after.named };
      };
      const first = await queueBox();
      await page.reload({ waitUntil: 'domcontentloaded' });
      const second = await queueBox();
      check(!first.was && !second.was && first.same && second.same && first.savedSame && second.savedSame && !first.named && !/queue/i.test(first.hash),
        'the live monitor\'s switch for the game\'s voice queue is off on load and after a reload made with it on; checking it changes no remembered setting and no share link, and it has no console name',
        JSON.stringify({ first, second }));
    } finally { await context.close(); }
    const blocked = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('refused by the test', 'QuotaExceededError'); }; });
      const page = await blocked.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await setControl(page, 'voice_scale', '0.5');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const left = await page.evaluate(() => Object.keys(DEFAULT_CONFIG).filter((k) => collectConfig()[k] !== DEFAULT_CONFIG[k]));
      check(left.length === 0, 'with localStorage.setItem throwing, the page boots on its defaults', left.join(', '));
    } finally { await blocked.close(); }
  }
  check(errors.length === 0, 'the journey has no page errors', errors.join('; '));
}

// W3-02d-1: the page renders on the game's timeline. Phrase timing (the
// game's voice queue or the file's own timing), fps_max and voice_buffer_ms;
// which sources keep the file's own timing; the line under the control and
// the line beside Hear; the old name voice_retime and old saved settings; a
// recorded live take held back. Each part in a page of its own.
// The options main's renderOptions() sent at the page's defaults (cache
// number v41), before this order: written out, so that the render on the
// file's own timing is held to main's and not to this branch's own function.
const MAIN_DEFAULT_OPTIONS = { codec: 'steam', room: null, underwater: false, captureChannel: 'left', micGain: 1, voiceScale: 1, hp: 0, lp: 20000,
  bits: 16, agc: true, retime: false, maxGain: 10, avgGain: 0.5, gate: null, gateThresholdDb: undefined, steamUptime: 777600, volume: 1,
  deviceRate: 48000, lossPct: 0, frameMs: 20, enableWarble: true, jitterMs: 0 };
// Whether the render on screen is, sample for sample, TF2Audio.process of the
// source on the page with `opts`; and whether it differs from a render with `other`.
const renderIs = (page, opts, other = null) => page.evaluate(async ({ opts, other }) => {
  const shown = state.processedBuffer, source = captureSource(state.decodedSource, opts.captureChannel);
  const same = (x) => x.length === shown.length && x.every((v, i) => Object.is(v, shown[i]));
  const want = (await TF2Audio.process(source, opts)).samples;
  return { same: same(want), differs: other ? !same((await TF2Audio.process(source, other)).samples) : null, length: shown.length };
}, { opts, other });
// The render on screen and the page around it, for the checks below.
const timelineState = (page) => page.evaluate(() => ({ renders: state.renderId, processing: state.processing, stale: state.stale,
  channel: !!(state.lastCodecInfo && state.lastCodecInfo.channel), key: state.renderedKey ? JSON.parse(state.renderedKey) : null,
  note: els.timelineNote.hidden ? null : els.timelineNote.textContent, line: !els.hearTimeline.hidden, status: els.renderStatus.textContent,
  failed: /^The render failed/.test(els.renderStatus.textContent),
  // No render running or coming, and the render on screen not of the controls' settings (a render that failed
  // is marked, and its line then gives way to the mark).
  unrendered: renderIdle() && state.renderedKey !== currentRenderKey(), controls: { tl: els.timeline.value, fps: els.fps.value, buf: els.bufferMs.value } }));
const receiverCell = (page) => page.evaluate(() => [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Receiver').textContent);

async function verifyPageTimeline(browser, base) {
  console.log('\n[Browser 8c] The page renders on the game\'s timeline (W3-02d-1)');
  const errors = [];
  const fresh = async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };
  // Wait until the render for the controls' settings is on screen, or failed
  // (a failed render's settings do not render again by themselves).
  const settled = (page, timeout = 60000) => page.waitForFunction(() => renderIdle()
    && (state.renderedKey === currentRenderKey() || state.cancelledKey === currentRenderKey()), null, { timeout });
  // A command, then the render it starts. A command that changes no key starts
  // none: after 5 s the render on screen is taken as it is, and the checks say
  // whether it is the one wanted.
  const renderAfter = async (page, command) => {
    const r = await page.evaluate(() => state.renderId);
    await page.evaluate((c) => execCommand(c), command);
    await page.waitForFunction((n) => state.renderId > n || !renderIdle(), r, { timeout: 5000 }).catch(() => {});
    await settled(page);
  };

  {
    const { context, page } = await fresh();
    try {
      // On load, and after Reset: the game's voice queue at 300 and 100.
      const sent = () => page.evaluate(() => { const o = renderOptions(); return { timeline: o.timeline, fps: o.fps, bufferMs: o.bufferMs, retime: 'retime' in o,
        controls: { tl: els.timeline.value, fps: els.fps.value, buf: els.bufferMs.value } }; });
      const onLoad = await sent();
      await page.evaluate(() => { execCommand('voice_timeline source'); execCommand('fps_max 67'); execCommand('voice_buffer_ms 200'); });
      await page.locator('#preset-reset').click();
      const afterReset = await sent();
      const want = '{"timeline":"game","fps":300,"bufferMs":100,"retime":false,"controls":{"tl":"game","fps":"300","buf":"100"}}';
      check(JSON.stringify(onLoad) === want && JSON.stringify(afterReset) === want,
        'on load and after Reset, Phrase timing is the game\'s voice queue at fps_max 300 and voice_buffer_ms 100, and renderOptions() sends those and no retime', JSON.stringify(onLoad));

      // The line under Phrase timing follows the settings with no render: no source yet.
      const noteAlone = await page.evaluate(() => {
        execCommand('snd_codec 0'); const skipped = els.timelineNote.hidden ? null : els.timelineNote.textContent;
        execCommand('snd_codec 1'); return { skipped, back: els.timelineNote.hidden };
      });
      check(/the codec is skipped/.test(noteAlone.skipped || '') && noteAlone.back,
        'with no source on the page, the codec skipped shows the line under Phrase timing and the codec on hides it, with no render', JSON.stringify(noteAlone));

      // The pitch on the game's queue: a 3 s tone of 440 Hz, its pitch by the
      // median length of a cycle, which a piece cut out of the tone does not move.
      await chooseFile(page, { name: 'pitch.wav', mimeType: 'audio/wav', buffer: wavTone(3) });
      const pitch = await page.evaluate(() => {
        const x = state.processedBuffer, rate = state.processedRate, ups = [];
        for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) ups.push(i - 1 - x[i - 1] / (x[i] - x[i - 1]));
        const cycles = ups.slice(1).map((u, k) => u - ups[k]).sort((a, b) => a - b);
        return { hz: rate / cycles[Math.floor(cycles.length / 2)], channel: !!(state.lastCodecInfo && state.lastCodecInfo.channel), cycles: cycles.length };
      });
      check(pitch.channel && Math.abs(pitch.hz - 440) < 1,
        'a 3 s tone of 440 Hz on the game\'s queue keeps its pitch: by the median length of a cycle, within 1 Hz of 440', `${pitch.hz.toFixed(2)} Hz over ${pitch.cycles} cycles`);

      // The default render of the speech fixture is the engine's on the game's timeline.
      await chooseFile(page, { name: 'timeline.wav', mimeType: 'audio/wav', buffer: wavSpeech(4) });
      const gameOpts = { ...MAIN_DEFAULT_OPTIONS, retime: undefined, timeline: 'game', fps: 300, bufferMs: 100 };
      const sourceOpts = { ...MAIN_DEFAULT_OPTIONS };
      const byDefault = await renderIs(page, gameOpts, sourceOpts), defaultState = await timelineState(page);
      check(byDefault.same && byDefault.differs && defaultState.channel,
        'the page\'s default render of the speech fixture is TF2Audio.process with timeline game, fps 300 and bufferMs 100, sample for sample, and differs from the render on the file\'s own timing',
        `${byDefault.length} samples`);
      check(defaultState.line, 'the line beside Hear is shown after a render on the game\'s timeline');
      const queueLine = (await consoleLines(page)).filter((t) => t.startsWith('S_Voice: the game\'s voice queue')).at(-1) || '';
      check(/^S_Voice: the game's voice queue at fps_max 300, voice_buffer_ms 100: a new phrase waits 30 ticks \(435 ms\); \d+ phrases? opened the channel, \d+ joined a running one; \d+ ms dropped to overflow$/.test(queueLine)
        && (await receiverCell(page)).includes('queue at 300 fps'),
        'the console gives the queue\'s frame rate, its wait in ticks and ms, the phrases that opened the channel and joined one, and the overflow; the chain strip says "queue at 300 fps"', queueLine);

      // fps_max 67 and voice_buffer_ms 200: the render is the engine's with those two numbers.
      await renderAfter(page, 'fps_max 67; voice_buffer_ms 200');
      const at67 = await renderIs(page, { ...gameOpts, fps: 67, bufferMs: 200 });
      const info67 = await page.evaluate(() => ({ fps: state.lastCodecInfo.channel.fps, bufferMs: state.lastCodecInfo.channel.bufferMs }));
      check(at67.same && info67.fps === 67 && info67.bufferMs === 200,
        'at fps_max 67 and voice_buffer_ms 200 the page\'s render is TF2Audio.process with those two numbers, and its codecInfo.channel says 67 and 200', JSON.stringify(info67));

      // voice_timeline source: main's render, sample for sample.
      await renderAfter(page, 'voice_timeline source');
      const onSource = await renderIs(page, sourceOpts), sourceState = await timelineState(page);
      check(onSource.same && !sourceState.channel && sourceState.key.timeline === 'source',
        'with voice_timeline source the page\'s render is TF2Audio.process with the options main\'s renderOptions() sent (retime false, no timeline), sample for sample',
        `${onSource.length} samples`);
      check(!sourceState.line && (await receiverCell(page)).includes('the file\'s own timing'),
        'the line beside Hear is hidden after a render on the file\'s own timing, and the chain strip says "the file\'s own timing"');

      // Under the file's own timing a changed frame rate or buffer changes no key.
      const mark = 'test: fps under the file\'s own timing';
      await page.evaluate((m) => { logLine(m, 'sys'); execCommand('fps_max 144'); execCommand('voice_buffer_ms 300'); }, mark);
      await page.waitForTimeout(1200);
      const unchanged = await timelineState(page), keySame = await page.evaluate(() => state.renderedKey === currentRenderKey());
      const startedSource = await rendersStartedSince(page, mark);
      check(keySame && !unchanged.stale && !unchanged.processing && startedSource === 0 && !('fps' in unchanged.key) && !('bufferMs' in unchanged.key),
        'under the file\'s own timing the key holds no fps or bufferMs, and a changed fps_max or voice_buffer_ms changes no key: the render on screen is not marked and nothing renders',
        `${startedSource} started`);

      // Every built-in preset renders; a preset sets Phrase timing and the
      // buffer and leaves fps_max; legacy (celt_22) keeps the file's own
      // timing, with the three controls hidden.
      await page.evaluate(() => { execCommand('fps_max 67'); execCommand('voice_buffer_ms 250'); });
      const presets = await page.evaluate(() => Object.keys(PRESETS));
      const results = [];
      for (const name of presets) {
        await page.evaluate((n) => execCommand(`exec preset_${n}`), name);
        await settled(page);
        const got = await timelineState(page);
        const sentNow = await page.evaluate(() => { const o = renderOptions(); return { timeline: o.timeline, fps: o.fps,
          hidden: ['fps', 'buffer_ms', 'timeline'].map((id) => document.getElementById(id).closest('.control').hidden) }; });
        results.push({ name, failed: got.failed, unrendered: got.unrendered, status: got.unrendered ? got.status : '', controls: got.controls, ...sentNow, channel: got.channel });
      }
      const wrong = results.filter((x) => x.failed || x.unrendered || x.controls.tl !== 'game' || x.controls.buf !== '100' || x.controls.fps !== '67'
        || (x.name === 'legacy' ? x.timeline !== 'source' || x.fps !== undefined || x.channel || !x.hidden.every(Boolean)
          : x.timeline !== 'game' || x.fps !== 67 || !x.channel || x.hidden.some(Boolean)));
      check(wrong.length === 0,
        'each built-in preset renders without an error, sets Phrase timing to the game\'s queue and voice_buffer_ms to 100, and leaves fps_max at 67; legacy (celt_22) sends timeline source and no fps, with the three controls hidden',
        wrong.length ? JSON.stringify(wrong) : presets.join(', '));
      await page.evaluate(() => { execCommand('exec preset_modern'); execCommand('fps_max 300'); });
      await settled(page);

      // The codec skipped: the file's own timing, and the line under the control says why.
      await renderAfter(page, 'snd_codec 0');
      const skipped = await timelineState(page);
      check(!skipped.failed && !skipped.unrendered && !skipped.channel && !skipped.line && skipped.key.timeline === 'source' && !('fps' in skipped.key) && /the codec is skipped/.test(skipped.note || '')
        && await page.evaluate(() => (els.timeline.getAttribute('aria-describedby') || '').split(' ').includes('timeline-note')),
        'with the codec skipped the render is made on the file\'s own timing, does not throw, the line beside Hear is hidden, and the line under Phrase timing gives the reason', skipped.note);
      await renderAfter(page, 'snd_codec 1');
      check(await page.evaluate(() => els.timelineNote.hidden && !(els.timeline.getAttribute('aria-describedby') || '').includes('timeline-note')),
        'with the codec on again the line under Phrase timing is hidden');
    } finally { await context.close(); }
  }

  // A source longer than 60 s: a changed volume, fps_max or Phrase timing
  // marks the render and starts none; the line beside Hear follows the render
  // on screen, not the controls. (W3-02d-2: such a change renders a longer
  // source by itself when its render took at most AUTO_RENDER_KEPT_MS, which
  // [Browser 8d] checks; here the render on screen's time is set over it, so
  // that the render stays marked.)
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'long.wav', mimeType: 'audio/wav', buffer: wavTone(61, 8000) }, 120000);
      await page.evaluate(() => { state.renderedTook = AUTO_RENDER_KEPT_MS + 1; });
      const first = await timelineState(page);
      const seen = [];
      for (const [id, value, back] of [['volume', '0.5', '1'], ['fps', '67', '300'], ['timeline', 'source', 'game']]) {
        const mark = `test: the long source, ${id}`;
        await page.evaluate((m) => logLine(m, 'sys'), mark);
        await setControl(page, id, value);
        await page.waitForTimeout(1500);
        const got = await timelineState(page);
        seen.push({ id, started: await rendersStartedSince(page, mark), stale: got.stale, line: got.line, status: got.status === STALE_TEXT });
        await setControl(page, id, back);
      }
      check(first.channel && first.line && seen.every((x) => x.started === 0 && x.stale && x.status && x.line),
        'a 61 s source whose render took over the limit: a changed volume, fps_max or Phrase timing each marks the render and starts none, and the line beside Hear stays as the render on screen has it',
        JSON.stringify(seen));
    } finally { await context.close(); }
  }

  // A demo's voice keeps the file's own timing (W3-02g, not built yet).
  {
    const { context, page } = await fresh();
    try {
      await page.locator('#file').setInputFiles(path.join(__dirname, 'demo', 'synthetic.dem'));
      await page.waitForFunction(() => !!state.sourceDemo, null, { timeout: 30000 });
      await settled(page);
      const demo = await timelineState(page);
      check(!demo.failed && !demo.unrendered && !demo.channel && demo.key.timeline === 'source' && !('fps' in demo.key) && demo.controls.tl === 'game'
        && /a demo's voice/.test(demo.note || ''),
        'with a demo as the source and Phrase timing on the game\'s queue, the render is made on the file\'s own timing, does not throw, and the line under the control gives the reason',
        `${demo.note}; ${demo.status}`);
    } finally { await context.close(); }
  }

  // A source from a video file: one the page can write back and one it
  // cannot, 60 s or less, and longer. Exactly one render follows the load,
  // with no channel, not marked, the reason under the control.
  {
    const { context, page } = await fresh();
    try {
      // A video of 61 s: the MP4 fixture with 61 s of tone as its audio, made by the page's own writer.
      const longMp4 = await page.evaluate(async (bytes) => {
        const samples = Float32Array.from({ length: 61 * 48000 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 440 * i / 48000));
        const { blob } = await TF2Video.remux(new Uint8Array(bytes).buffer, samples, 48000);
        return [...new Uint8Array(await blob.arrayBuffer())];
      }, [...fs.readFileSync(path.join(__dirname, 'video', 'vp9_opus.mp4'))]);
      const videos = [
        ['vp9_opus.mp4 (written back)', path.join(__dirname, 'video', 'vp9_opus.mp4')],
        ['tone_16000.webm (audio only)', path.join(__dirname, 'filerate', 'tone_16000.webm')],
        ['a 61 s MP4 (written back)', { name: 'long-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from(longMp4) }],
        ['a 61 s Matroska file (audio only)', { name: 'long-video.mkv', mimeType: 'video/x-matroska', buffer: wavTone(61, 8000) }]
      ];
      for (const [label, file] of videos) {
        // An audio file first, so that the video follows a source on the game's timeline.
        await chooseFile(page, { name: 'before.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
        const mark = `test: the video ${label}`;
        await page.evaluate((m) => logLine(m, 'sys'), mark);
        await chooseFile(page, file, 120000);
        await page.waitForTimeout(1500);
        const got = await timelineState(page), seconds = await page.evaluate(() => state.decodedSource.duration);
        const started = await rendersStartedSince(page, mark);
        check(started === 1 && !got.failed && !got.unrendered && !got.channel && !got.stale && !got.line && got.key.timeline === 'source' && !('fps' in got.key)
          && /a video keeps its picture's timing/.test(got.note || ''),
          `${label}, ${seconds.toFixed(1)} s: exactly one render follows the load, on the file's own timing (no channel), not marked, and the line under the control gives the reason`,
          `${started} render${started === 1 ? '' : 's'} started; ${got.note}`);
      }
      // An MP4 with no video track is audio: it renders on the game's queue, with no reason under the control.
      await chooseFile(page, { name: 'audio-only.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(path.join(__dirname, 'filerate', 'tone_22050.m4a')) });
      const audioOnly = await timelineState(page);
      check(audioOnly.channel && audioOnly.note === null && audioOnly.key.timeline === 'game' && !audioOnly.stale,
        'an MP4 with no video track (tone_22050.m4a under an .mp4 name) renders on the game\'s queue, with no reason under the control', JSON.stringify(audioOnly.key && audioOnly.key.timeline));
      // The batch's key does not see the page's source: with a video on the
      // page, two audio files in the batch render, and both rows end "Done".
      await chooseFile(page, path.join(__dirname, 'video', 'vp9_opus.mp4'));
      await page.locator('#batch-files').setInputFiles([
        { name: 'batch-a.wav', mimeType: 'audio/wav', buffer: wavSpeech(1) }, { name: 'batch-b.wav', mimeType: 'audio/wav', buffer: wavTone(0.5) }]);
      await page.locator('#batch-run').click();
      await page.waitForFunction(() => /2 rendered/.test(document.getElementById('batch-summary').textContent), null, { timeout: 60000 }).catch(() => {});
      const rows = await page.locator('.batch-item .bi-status').allTextContents();
      check(rows.length === 2 && rows.every((t) => /^Done/.test(t)),
        'with a video as the page\'s source, two audio files in the batch render and both rows end "Done"', rows.join(' | '));
      // An audio file after a video is on the game's timeline again.
      await chooseFile(page, { name: 'after.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
      const after = await timelineState(page);
      check(after.channel && after.note === null && after.line, 'an audio file after a video renders on the game\'s timeline again, with no reason under the control');
    } finally { await context.close(); }
  }

  // voice_retime, the old name; remembered settings and share links.
  {
    const { context, page } = await fresh();
    try {
      const answers = await page.evaluate(() => {
        const out = {};
        const line = () => [...document.getElementById('console-out').children].map((e) => e.textContent).filter((t) => /voice_retime is an old name/.test(t)).length;
        const before = line();
        execCommand('voice_retime 0'); out.zero = els.timeline.value; out.zeroLine = line() - before;
        execCommand('voice_retime 1'); out.one = els.timeline.value; out.oneLine = line() - before;
        return out;
      });
      check(answers.zero === 'source' && answers.one === 'game' && answers.zeroLine === 1 && answers.oneLine === 2,
        'voice_retime 0 sets voice_timeline source, voice_retime 1 sets game, and each prints that the flat rule is no longer offered and voice_timeline took its place', JSON.stringify(answers));
      // A remembered retime of 0 (settings saved before this order) leaves the game's queue.
      await page.evaluate(() => localStorage.setItem('tf2ve_settings', JSON.stringify({ vs: '0.5', retime: '0' })));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const remembered = await page.evaluate(() => ({ tl: els.timeline.value, vs: els.voiceScale.value }));
      check(remembered.tl === 'game' && remembered.vs === '0.5', 'a remembered retime of 0 is dropped: Phrase timing stays the game\'s voice queue (the rest is kept)', JSON.stringify(remembered));
      // With voice_timeline source set first (and remembered), a link with retime=1 gives the game's queue.
      await page.evaluate(() => execCommand('voice_timeline source'));
      await page.goto(`${base}/#retime=1`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const linked = await page.evaluate(() => els.timeline.value);
      check(linked === 'game', 'with voice_timeline source set first, a share link with retime=1 gives the game\'s voice queue', linked);
      // A link with the three new keys, and writeconfig writes them back.
      await page.goto(`${base}/#tl=source&fps=67&buf=200`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const keys = await page.evaluate(() => {
        const out = { tl: els.timeline.value, fps: els.fps.value, buf: els.bufferMs.value };
        history.replaceState(null, '', location.pathname);
        execCommand('writeconfig');
        const written = new URLSearchParams(location.hash.slice(1));
        out.written = { tl: written.get('tl'), fps: written.get('fps'), buf: written.get('buf'), retime: written.has('retime') };
        return out;
      });
      check(keys.tl === 'source' && keys.fps === '67' && keys.buf === '200' && keys.written.tl === 'source' && keys.written.fps === '67' && keys.written.buf === '200' && !keys.written.retime,
        'a share link with tl=source&fps=67&buf=200 gives those three values, and writeconfig writes them back (and no retime)', JSON.stringify(keys));
      // voice_buffer_ms is a whole number within 1 to 5000.
      const whole = await page.evaluate(() => { const out = []; for (const v of ['150.4', '0', '9000']) { execCommand(`voice_buffer_ms ${v}`); out.push(els.bufferMs.value); } return out; });
      check(JSON.stringify(whole) === '["150","1","5000"]', 'voice_buffer_ms takes a whole number from 1 to 5000', JSON.stringify(whole));
    } finally { await context.close(); }
  }

  // A recorded live take of 90 s, with Phrase timing on the game's queue: its
  // key is the file's own timing, it is marked, nothing renders by itself.
  // (The live monitor's own take, of a few seconds, is checked in [Browser 3f].)
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'before.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
      const mark = 'test: a 90 s live take';
      await page.evaluate((m) => {
        logLine(m, 'sys');
        const rate = 48000, n = 90 * rate, dry = Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 300 * i / rate));
        mountLiveTake({ dry, wet: dry.slice(), rate, frameLog: new Int8Array(90 * 50).fill(2),
          counts: { modes: { hybrid: 4500 }, spurts: 1, gated: 0, frames: 4500, dtx: 0, lost: 0, late: 0 },
          info: { codec: 'steam', realOpus: true, version: 'test', bitrate: 32000, vbr: true, dtx: true, gate: -40, autoGain: true, voiceRate: 44100, frameSamples: 480 } });
      }, mark);
      await page.waitForTimeout(1500);
      const take = await timelineState(page);
      const started = await rendersStartedSince(page, mark);
      check(take.key.timeline === 'source' && !('fps' in take.key) && take.stale && !take.processing && !take.line && started === 0
        && take.status.startsWith('Recorded live · 90.0 s') && take.status.endsWith('on the file\'s own timing; Render gives it on the game\'s voice queue')
        && await page.evaluate(() => els.dl.textContent) === 'Download WAV (the live take)',
        'a 90 s live take with Phrase timing on the game\'s queue: its key holds timeline source and no fps; it is marked, nothing renders, the line beside Hear is hidden, and its line says how it was made',
        `${started} started; ${take.status}`);
    } finally { await context.close(); }
  }
  check(errors.length === 0, 'the game\'s timeline on the page: no page errors', errors.join('; '));
}

// BC-4b: the page's words and controls for jitter as arrival times (BC-4a).
// The line under the jitter control, on Steam voice on the game's queue and
// on the file's own timing (the setting itself, the codec skipped, a demo's
// voice, a video) and on another codec; the chain strip's Network cell;
// net_fakelag and net_jitter; a share link with jit=50; the Laggy preset.
// The live monitor's note is checked in [Browser 3f].
const JITTER_OFF_TEXT = 'Jitter does nothing on the file\'s own timing: it moves when packets reach the game\'s voice queue.';
const JITTER_FIT_TEXT = 'On this codec jitter is a fit: single frames marked late, 3.2% of them at 50 ms. The game makes no frame late.';
// Where no codec runs (the fix round): on a codec other than Steam voice.
const JITTER_SKIPPED_TEXT = 'Jitter does nothing here: the codec is skipped.';
const JITTER_DEMO_TEXT = 'Jitter does nothing here: a demo\'s voice is played as the game received it.';
const NET_FAKELAG_TEXT = 'A steady lag delays every packet alike and a render does not show it. '
  + 'The app takes net_fakelag as twice net_fakejitter, the least at which the game applies the whole jitter';
// The line under the jitter control (null when hidden), whether the control
// names it, the chain strip's Network cell, and the render on screen.
const jitterState = (page) => page.evaluate(() => ({
  note: els.jitterNote.hidden ? null : els.jitterNote.textContent, jitter: els.jitter.value,
  named: (els.jitter.getAttribute('aria-describedby') || '').split(/\s+/).includes('jitter-note'),
  network: [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Network').textContent,
  hot: [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Network').classList.contains('hot'),
  receiver: [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Receiver').textContent,
  timelineNote: els.timelineNote.hidden ? null : els.timelineNote.textContent,
  arrivals: state.lastCodecInfo ? state.lastCodecInfo.arrivals || null : null, channel: !!(state.lastCodecInfo && state.lastCodecInfo.channel),
  key: state.renderedKey ? JSON.parse(state.renderedKey) : null, from: state.renderedFrom }));
// Hidden and not named: the line is cleared.
const jitterLineCleared = (s) => s.note === null && !s.named;

async function verifyJitterPage(browser, base) {
  console.log('\n[Browser 8e] Jitter on the page (BC-4b)');
  const errors = [];
  const fresh = async (url = base) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };
  const settled = (page, timeout = 60000) => page.waitForFunction(() => renderIdle()
    && (state.renderedKey === currentRenderKey() || state.cancelledKey === currentRenderKey()), null, { timeout });
  const renderAfter = async (page, command) => {
    const r = await page.evaluate(() => state.renderId);
    await page.evaluate((c) => execCommand(c), command);
    await page.waitForFunction((n) => state.renderId > n || !renderIdle(), r, { timeout: 5000 }).catch(() => {});
    await settled(page);
  };

  {
    const { context, page } = await fresh();
    try {
      // With no source, the line follows the settings at once.
      const steps = await page.evaluate(() => {
        const cell = () => [...document.querySelectorAll('#signal-chain li')].find((li) => li.querySelector('b').textContent === 'Network');
        const now = () => ({ note: els.jitterNote.hidden ? null : els.jitterNote.textContent,
          named: (els.jitter.getAttribute('aria-describedby') || '').split(/\s+/).includes('jitter-note'),
          network: cell().textContent, hot: cell().classList.contains('hot') });
        // A demo's voice on celt_22, with no source decoded: the page's demo
        // state alone, read by the line (the render is not asked for).
        const fakeDemo = (on) => { state.sourceDemo = on ? { codecKey: 'celt_22' } : null; updateJitterNote(); };
        const out = {};
        for (const [label, command] of [['game', 'net_fakejitter 50'], ['skipped', 'snd_codec 0; net_fakeloss 10'], ['codecOn', 'net_fakeloss 0; snd_codec 1'],
          ['source', 'voice_timeline source'], ['sourceZero', 'net_fakejitter 0'], ['celt', 'sv_voicecodec celt_22; net_fakejitter 50'],
          ['celtSkipped', 'snd_codec 0; net_fakeloss 10'], ['celtOn', 'net_fakeloss 0; snd_codec 1'], ['celtDemo', () => fakeDemo(true)], ['celtNoDemo', () => fakeDemo(false)],
          ['celtZero', 'net_fakejitter 0'], ['back', 'sv_voicecodec steam; voice_timeline game; net_fakejitter 50'], ['gameZero', 'net_fakejitter 0']]) {
          if (typeof command === 'function') command(); else execCommand(command);
          out[label] = now();
        }
        return out;
      });
      const cleared = (x) => x.note === null && !x.named, shows = (x, text) => x.note === text && x.named;
      check(cleared(steps.game) && cleared(steps.codecOn) && cleared(steps.back),
        'with no source: on Steam voice on the game\'s queue at jitter 50 the line under the jitter control is hidden and not named', JSON.stringify(steps.game));
      check(shows(steps.skipped, JITTER_OFF_TEXT) && shows(steps.source, JITTER_OFF_TEXT),
        'with no source: with the codec skipped, and with voice_timeline source, the line says jitter does nothing on the file\'s own timing, and the control names it', JSON.stringify([steps.skipped, steps.source]));
      check(shows(steps.celt, JITTER_FIT_TEXT) && shows(steps.celtOn, JITTER_FIT_TEXT) && shows(steps.celtNoDemo, JITTER_FIT_TEXT)
        && steps.celt.network.includes('· 50 ms jitter (a fit)') && steps.celt.hot,
        'with no source: on celt_22 at jitter 50 the line says jitter is a fit there, the control names it, and the chain strip marks "50 ms jitter (a fit)" hot', JSON.stringify(steps.celt));
      // The fix round: where no codec runs, jitter does nothing on every codec, and neither loss nor jitter acts.
      const offCell = (x, why) => x.network.endsWith(`loss and jitter off (${why})`) && !/% lost|ms jitter/.test(x.network) && !x.hot;
      check(shows(steps.celtSkipped, JITTER_SKIPPED_TEXT) && offCell(steps.celtSkipped, 'the codec is skipped'),
        'with no source: celt_22 with the codec skipped, jitter 50 and loss 10: the line says "Jitter does nothing here: the codec is skipped.", and the chain strip shows neither loss nor jitter as acting, not hot',
        JSON.stringify(steps.celtSkipped));
      check(shows(steps.celtDemo, JITTER_DEMO_TEXT) && offCell(steps.celtDemo, 'a demo\'s voice as received'),
        'with no source: celt_22 with a demo\'s voice (the page\'s demo state), jitter 50: the line says "Jitter does nothing here: a demo\'s voice is played as the game received it.", and the strip shows no jitter acting, not hot',
        JSON.stringify(steps.celtDemo));
      check(offCell(steps.skipped, 'the codec is skipped'), 'with no source: Steam voice with the codec skipped, jitter 50 and loss 10: the chain strip shows neither loss nor jitter as acting, not hot',
        JSON.stringify(steps.skipped));
      check(cleared(steps.sourceZero) && cleared(steps.celtZero) && cleared(steps.gameZero),
        'with no source: jitter back to 0 hides the line and the control no longer names it, on the file\'s own timing, on celt_22 and on the game\'s queue', JSON.stringify([steps.sourceZero, steps.celtZero, steps.gameZero]));

      // net_jitter sets the control; net_fakelag prints its one line and changes nothing.
      const lag = await page.evaluate((mark) => {
        const controls = () => JSON.stringify([...document.getElementById('controls-wrapper').querySelectorAll('select, input')]
          .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value]));
        execCommand('net_jitter 30');
        const jitter = els.jitter.value, before = controls(), stored = localStorage.getItem('tf2ve_settings');
        logLine(mark, 'sys');
        execCommand('net_fakelag 100');
        execCommand('net_fakelag');
        const lines = [...document.getElementById('console-out').children].map((e) => e.textContent);
        return { jitter, same: controls() === before, storedSame: localStorage.getItem('tf2ve_settings') === stored,
          lines: lines.slice(lines.lastIndexOf(mark) + 1), linked: Object.values(idToCvarMap).includes('net_fakelag') };
      }, 'test: net_fakelag');
      check(lag.jitter === '30', 'net_jitter 30 sets the jitter control to 30', lag.jitter);
      check(JSON.stringify(lag.lines) === JSON.stringify(['] net_fakelag 100', NET_FAKELAG_TEXT, '] net_fakelag', NET_FAKELAG_TEXT]) && lag.same && lag.storedSame && !lag.linked,
        'net_fakelag 100 and net_fakelag each print their one line and no control changes (nor the remembered settings); no control is net_fakelag\'s', JSON.stringify(lag.lines));
      await page.evaluate(() => execCommand('net_fakejitter 0'));

      // A render on the game's queue at jitter 50: the line is hidden, and the render has its arrivals.
      await chooseFile(page, { name: 'jitter.wav', mimeType: 'audio/wav', buffer: wavSpeech(4) });
      await renderAfter(page, 'net_fakejitter 50');
      const game = await jitterState(page);
      check(jitterLineCleared(game) && game.hot && game.receiver.includes('queue at 300 fps') && game.channel && game.arrivals && game.arrivals.jitterMs === 50 && game.key.jitterMs === 50 && game.key.timeline === 'game'
        && game.network.includes('· 50 ms jitter') && !/\(a fit\)|jitter off/.test(game.network),
        'Steam voice on the game\'s queue, jitter 50: the line is hidden, the render on screen has codecInfo.arrivals, and the chain strip says "50 ms jitter"',
        `${game.network}; ${JSON.stringify(game.arrivals)}`);
      check(game.from === 'b', 'on Steam voice a changed jitter renders from the kept codec result', String(game.from));

      // voice_timeline source (sourceTimingReason() is null there): the line, and the render of jitter 0.
      await renderAfter(page, 'voice_timeline source');
      const source = await jitterState(page);
      const zeroOpts = await page.evaluate(() => ({ ...renderOptions(), jitterMs: 0 }));
      const same = await renderIs(page, zeroOpts);
      check(source.note === JITTER_OFF_TEXT && source.named && !source.hot && source.timelineNote === null && source.key.timeline === 'source' && source.key.jitterMs === 50 && !source.arrivals
        && source.network.includes('· jitter off (no queue)') && !source.network.includes('50 ms jitter'),
        'voice_timeline source, jitter 50: the line says jitter does nothing on the file\'s own timing, the control names it, and the chain strip says "jitter off (no queue)", not hot', source.network);
      check(same.same, 'voice_timeline source, jitter 50: the render on screen is TF2Audio.process at jitter 0, sample for sample', `${same.length} samples`);
      await renderAfter(page, 'net_fakejitter 0');
      const sourceZero = await jitterState(page);
      check(jitterLineCleared(sourceZero) && !/jitter/.test(sourceZero.network), 'voice_timeline source, jitter back to 0: the line is hidden and not named, and the chain strip names no jitter', sourceZero.network);

      // Another codec: the fit.
      await renderAfter(page, 'sv_voicecodec celt_22');
      await renderAfter(page, 'net_fakejitter 50');
      const celt = await jitterState(page);
      check(celt.note === JITTER_FIT_TEXT && celt.named && celt.network.includes('· 50 ms jitter (a fit)') && celt.key.jitterMs === 50,
        'sv_voicecodec celt_22, jitter 50: the line says jitter is a fit on this codec, and the chain strip says "50 ms jitter (a fit)"', celt.network);
      await renderAfter(page, 'net_fakejitter 0');
      check(jitterLineCleared(await jitterState(page)), 'sv_voicecodec celt_22, jitter back to 0: the line is hidden and not named');

      // The Laggy preset sets jitter 50 on Steam voice on the game's queue; the next preset sets 0.
      await page.getByRole('button', { name: 'Laggy 18% Loss', exact: true }).click();
      await settled(page);
      const laggy = await jitterState(page);
      await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
      await settled(page);
      const modern = await jitterState(page);
      check(laggy.jitter === '50' && laggy.key.jitterMs === 50 && laggy.key.timeline === 'game' && jitterLineCleared(laggy) && laggy.arrivals
        && laggy.network.includes('18% lost · 50 ms jitter') && modern.jitter === '0' && modern.key.jitterMs === 0 && jitterLineCleared(modern) && !modern.arrivals,
        'the Laggy preset sets jitter 50 on Steam voice on the game\'s queue (the line hidden, the render with its arrivals), and Modern after it sets 0',
        `${laggy.network} | ${modern.network}`);
    } finally { await context.close(); }
  }

  // A share link with jit=50 and nothing else: Steam voice on the game's queue at jitter 50.
  {
    const { context, page } = await fresh();
    try {
      await page.goto(`${base}/#jit=50`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const linked = await page.evaluate(() => { const o = renderOptions();
        return { jitter: els.jitter.value, codec: els.codec.value, tl: els.timeline.value, timeline: o.timeline, jitterMs: o.jitterMs, hidden: els.jitterNote.hidden }; });
      check(linked.jitter === '50' && linked.codec === 'steam' && linked.tl === 'game' && linked.timeline === 'game' && linked.jitterMs === 50 && linked.hidden,
        'a share link with jit=50 and nothing else sets the jitter control to 50 on Steam voice with the game\'s queue, and the line under it is hidden', JSON.stringify(linked));
    } finally { await context.close(); }
  }

  // A demo's voice and a video keep the file's own timing: the line shows; an audio file after them hides it.
  {
    const { context, page } = await fresh();
    try {
      await page.evaluate(() => execCommand('net_fakejitter 50'));
      await page.locator('#file').setInputFiles(path.join(__dirname, 'demo', 'synthetic.dem'));
      await page.waitForFunction(() => !!state.sourceDemo, null, { timeout: 30000 });
      await settled(page);
      const demo = await jitterState(page);
      check(demo.note === JITTER_OFF_TEXT && demo.named && /a demo's voice/.test(demo.timelineNote || '') && demo.key.timeline === 'source' && !demo.arrivals
        && demo.network.endsWith('loss and jitter off (a demo\'s voice as received)') && !demo.hot
        && demo.receiver.endsWith('the file\'s own timing') && !demo.receiver.includes('queue at'),
        'a demo\'s voice with jitter 50 on Steam voice on the game\'s queue: the line says jitter does nothing on the file\'s own timing; the chain strip shows neither loss nor jitter as acting, and its Receiver cell says "the file\'s own timing"',
        `${demo.note}; ${demo.network}; ${demo.receiver}`);
      await chooseFile(page, path.join(__dirname, 'video', 'vp9_opus.mp4'), 120000);
      await settled(page);
      const video = await jitterState(page);
      check(video.note === JITTER_OFF_TEXT && video.named && /a video keeps its picture's timing/.test(video.timelineNote || '') && !video.arrivals
        && video.network.includes('· jitter off (no queue)') && !video.hot && video.receiver.endsWith('the file\'s own timing') && !video.receiver.includes('queue at'),
        'a video with jitter 50: the line says jitter does nothing on the file\'s own timing, the strip says "jitter off (no queue)", and its Receiver cell says "the file\'s own timing"',
        `${video.note}; ${video.network}; ${video.receiver}`);
      await chooseFile(page, { name: 'after.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
      await settled(page);
      const after = await jitterState(page);
      check(jitterLineCleared(after) && after.arrivals && after.network.includes('· 50 ms jitter') && after.receiver.includes('queue at 300 fps'),
        'an audio file after them renders on the game\'s queue with its arrivals, and the line is hidden again', after.network);
    } finally { await context.close(); }
  }
  check(errors.length === 0, 'jitter on the page: no page errors', errors.join('; '));
}

// W3-02e: talk in twelve phrases with pauses near one second, where the
// game's voice queue at 300 frames a second runs out for some draws of the
// sender's clock and not for others: low-passed noise with ten harmonics of a
// gliding 120 Hz tone, 10 ms ramps, from 0.4 s, 30 s at 48 kHz (the planner's
// signal, docs/reports/W3-02ef-plan.md, with the plan review's lengths).
const PHRASE_PLAN = [[1.5, .95], [1.2, 1.0], [1.0, 1.05], [1.4, .9], [0.8, 1.1], [1.3, .6], [1.6, 1.0], [1.0, .97], [2.0, 1.02],
  [1.2, .92], [1.5, 1.4], [1.1, 1.0]];
function wavPhrases(seconds = 30, rate = 48000) {
  const length = Math.round(seconds * rate), buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const x = new Float32Array(length);
  let t = 0.4;
  for (const [len, pause] of PHRASE_PLAN) {
    const a = Math.round(t * rate), b = Math.min(length, Math.round((t + len) * rate));
    let lp = 0;
    for (let i = a; i < b; i++) {
      const tt = i / rate;
      lp += 0.3 * (random() - lp);
      let v = 0.25 * lp;
      const f0 = 120 + 30 * Math.sin(tt * 1.3);
      for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * f0 * h * tt + h) / (h + 1);
      x[i] = 0.12 * Math.min(1, (i - a) / 480, (b - i) / 480) * (0.6 + 0.4 * Math.sin(tt * 9)) * v;
    }
    t += len + pause;
  }
  for (let i = 0; i < length; i++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 0x7fff), 44 + i * 2);
  return buffer;
}

// The lane's colours as the canvas holds them, for the checks below: the
// codec lane's middle row, one [r, g, b] per pixel of the canvas, and the
// layout and view it was drawn with. `view`: [t0, span] to draw first, or
// null for the view as it is.
const laneRow = (page, view = null) => page.evaluate((v) => {
  const buffer = audibleBuffer();
  if (v) setVizView(v[0], v[1], buffer.samples.length / buffer.rate);
  drawVisualizer();
  const canvas = document.getElementById('visualizer'), rect = canvas.getBoundingClientRect(), scale = canvas.width / rect.width;
  const L = vizLayout(rect.width, rect.height), range = visibleRange(buffer);
  const data = canvas.getContext('2d').getImageData(0, Math.round((L.laneY + L.laneH / 2) * scale), canvas.width, 1).data;
  const row = [];
  for (let i = 0; i < data.length; i += 4) row.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return { row, scale, w: L.w, laneH: L.laneH, t0: range.t0, span: range.t1 - range.t0 };
}, view);
const rgbOf = (hex) => parseInt(hex.slice(1), 16);

// The page's render on the queue: its heard skips, and the canvas pixel of a
// time in the view `lane` was read with.
const pixelOf = (lane, time) => Math.floor(Math.floor((time - lane.t0) / lane.span * lane.w) * lane.scale);
// Whether the lane's white pixels are exactly the marks of `skips`: each
// skip in view has its pixel white, and every white pixel is within one of a
// skip's.
function marksMatch(lane, skips, white) {
  const at = skips.map((d) => pixelOf(lane, d.time)).filter((x) => x >= 0 && x < lane.row.length);
  const lit = lane.row.map((c, x) => (c === white ? x : -1)).filter((x) => x >= 0);
  return { inView: at.length, lit: lit.length, missing: at.filter((x) => lane.row[x] !== white),
    stray: lit.filter((x) => !at.some((y) => Math.abs(x - y) <= lane.scale)) };
}

async function verifyLaneAndTake(browser, base) {
  console.log('\n[Browser 8f] The codec lane and the real-take panel on the game\'s voice queue (W3-02e)');
  const errors = [];
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  // A command, then the render it starts (as in [Browser 8c]).
  const settled = (timeout = 90000) => page.waitForFunction(() => renderIdle()
    && (state.renderedKey === currentRenderKey() || state.cancelledKey === currentRenderKey()), null, { timeout });
  const renderAfter = async (command) => {
    const r = await page.evaluate(() => state.renderId);
    await page.evaluate((c) => { for (const line of c.split(';')) execCommand(line.trim()); }, command);
    await page.waitForFunction((n) => state.renderId > n || !renderIdle(), r, { timeout: 5000 }).catch(() => {});
    await settled();
  };
  // Before a change that ends in a new report: a marker in the report box,
  // which the page's next report (or its re-alignment) replaces.
  const markReport = () => page.evaluate(() => { const i = document.createElement('i'); i.id = 'stale-report'; els.referenceReport.append(i); });
  const reportReady = () => page.waitForFunction(() => state.realTake && !document.getElementById('stale-report')
    && document.querySelector('#reference-report table') && !/^Comparing/.test(els.referenceReport.textContent), null, { timeout: 120000 });
  const panel = () => page.evaluate(() => {
    const info = state.lastCodecInfo, take = state.realTake;
    return { status: els.referenceStatus.textContent, lines: [...els.referenceReport.querySelectorAll('p')].map((p) => p.textContent),
      guided: take.timeline.guided, guide: take.guideSpurts, pieces: take.timeline.segments.map((g) => g.spurt), render: info.channel && info.channel.spurts ? info.channel.spurts : null,
      changes: phraseChanges(take.timeline, take.guideSpurts, info.channel && info.channel.spurts ? info.channel.spurts : null) };
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.mouse.move(0, 0);
    await chooseFile(page, { name: 'phrases.wav', mimeType: 'audio/wav', buffer: wavPhrases() }, 120000);
    await page.locator('#viz-wave').click();
    const white = await page.evaluate(() => LANE_SKIP_COLOR).then(rgbOf);
    const queue = await page.evaluate(() => {
      const info = state.lastCodecInfo, ch = info.channel, end = state.renderedSource.duration;
      return { opts: (({ timeline, fps, bufferMs }) => ({ timeline, fps, bufferMs }))(renderOptions()), onQueue: laneOnQueue(info),
        frames: info.frames, sampleRate: info.sampleRate, frameSamples: info.frameSamples, lookahead: info.lookahead, colors: FRAME_STYLE.map((s) => s.color),
        spurts: ch.spurts, heard: ch.drops.filter((d) => d.time < end), unheard: ch.drops.filter((d) => d.time >= end).length };
    });
    const earlyOf = (spurts) => spurts.map((s, i) => (s.offsetStartMs !== null && s.offsetStartMs <= -80 ? i + 1 : 0)).filter(Boolean);
    check(queue.opts.timeline === 'game' && queue.opts.fps === 300 && queue.onQueue && queue.heard.length > 0,
      'the page renders the phrases on the game\'s voice queue at 300 frames a second by default, and the queue skips sound in it',
      `${queue.spurts.length} phrases of the sender, ${queue.spurts.filter((s) => !s.opened).length} joined the queue, phrases ${earlyOf(queue.spurts).join(' and ')} start early; ${queue.heard.length} skips heard`);

    // 1. The lane's place for a played slot: 0.02 f, by frameStart and frameAt.
    const place = await page.evaluate(() => {
      const info = state.lastCodecInfo, bad = [];
      for (let f = 0; f < info.frames; f++) {
        if (Math.abs(frameStart(info, f) - 0.02 * f) > 1e-9 || frameAt(info, 0.02 * f + 0.01) !== f) bad.push(f);
      }
      return { bad: bad.length, first: bad.slice(0, 3), frames: info.frames };
    });
    check(place.bad === 0, 'on the game\'s voice queue the lane places played slot f at 0.02 f s: frameStart(info, f) is 0.02 f and frameAt(info, 0.02 f + 0.01) is f, for every slot',
      `${place.frames} slots${place.bad ? `; wrong at ${place.first.join(', ')}` : ''}`);
    // Zoomed out so that frames are aggregated (half a slot a pixel): the first
    // frame pixel of each phrase is the first pixel that starts at or after
    // its first played slot (a pixel over the slot before and that slot shows
    // the slot before, the more common kind winning ties toward "silence").
    const notSent = rgbOf(queue.colors[0]), frameColors = new Set(queue.colors.slice(1).map(rgbOf));
    const edges = [];
    const firstSlots = await page.evaluate(() => {
      const log = state.lastCodecInfo.frameLog, out = [];
      for (let f = 4; f + 2 < log.length; f++) if (log[f] && log[f + 1] && !log[f - 1] && !log[f - 2] && !log[f - 3] && !log[f - 4]) out.push(f);
      return out;
    });
    const w = (await laneRow(page)).w, pixel = 0.0101;   // a pixel just over half a slot
    for (const f of firstSlots) {
      const lane = await laneRow(page, [0.02 * f - 40.5 * pixel, w * pixel]);
      const perPixel = lane.span / lane.w / 0.02;
      const want = Math.ceil((0.02 * f - lane.t0) / (lane.span / lane.w) - 1e-6);
      let got = -1;
      for (let x = Math.max(0, want - 8); x < Math.min(lane.w, want + 8); x++) {
        const c = lane.row[Math.floor(x * lane.scale)];
        if (frameColors.has(c)) { got = x; break; }
        if (c !== notSent && c !== white) { got = -2; break; }
      }
      if (lane.row[Math.floor(want * lane.scale)] === white) continue;   // a mark on the pixel itself
      edges.push({ f, want, got, perPixel });
    }
    check(edges.length >= 3 && edges.every((e) => e.got === e.want && e.perPixel >= 0.5),
      'zoomed out to half a slot a pixel, the first frame pixel of each phrase is the first pixel at or after frameStart of its first played slot',
      edges.map((e) => `slot ${e.f}: pixel ${e.got} (want ${e.want})`).join(', '));

    // 2. A mark for each heard skip, in the whole view and in the first second.
    const whole = marksMatch(await laneRow(page, [0, 31]), queue.heard, white);
    check(whole.inView === queue.heard.length && whole.missing.length === 0 && whole.stray.length === 0,
      'the lane draws the mark\'s colour at the pixel of every heard skip and at no pixel more than one away from one, over the whole render',
      `${whole.inView} skips, ${whole.lit} pixels lit${whole.missing.length ? `; missing at ${whole.missing.join(', ')}` : ''}${whole.stray.length ? `; stray at ${whole.stray.join(', ')}` : ''}`);
    const firstSecond = await laneRow(page, [0, 1]), first = marksMatch(firstSecond, queue.heard, white);
    check(first.inView >= 1 && first.missing.length === 0 && first.stray.length === 0,
      'zoomed into the first second the lane draws the marks there, each on the pixel of its skip, and nothing else in their colour',
      `${first.inView} in view, ${first.lit} pixels lit`);

    // 3. The hover: the first slot of a phrase that joined the queue, a mark, an empty slot.
    const hover = await page.evaluate(() => {
      const info = state.lastCodecInfo, ch = info.channel, rate = 44100;
      const text = (f) => laneHoverText(info, 0.02 * f + 0.01, 1e-4);
      const number = (at) => Math.floor((at * info.sampleRate / rate + info.lookahead) / info.frameSamples);
      const joined = ch.spurts.find((s) => !s.opened);
      let f = 0;
      while (f < ch.source.length && !(ch.source[f] >= 0 && ch.source[f] / rate >= joined.start - 1e-9 && ch.source[f] / rate <= joined.end)) f++;
      const at = ch.source[f];
      const join = { f, at, code: info.frameLog[f], text: text(f), ms: (882 * f + 441 - at) / 44.1, k: number(at) };
      // Every slot that plays the source: a number where its played code is
      // not 0 (one at least whose place at 24 kHz is 324 or more into its
      // 480-sample frame, so the look-ahead moves it to the next), none where it is.
      const played = [], quiet = [];
      for (let g = 0; g < Math.min(ch.source.length, info.frames); g++) {
        if (ch.source[g] < 0) continue;
        const t = text(g), k = number(ch.source[g]);
        if (info.frameLog[g]) played.push({ g, k, ok: t.includes(`· sent frame ${k} ·`), late: (ch.source[g] * info.sampleRate / rate) % info.frameSamples >= info.frameSamples - info.lookahead, t });
        else quiet.push({ g, ok: !t.includes('sent frame') && t.includes('the source\'s'), t });
      }
      let e = 0;
      while (e < ch.source.length && !(ch.source[e] === -1 && info.frameLog[e] === 0)) e++;
      return { join, played: { n: played.length, wrong: played.filter((p) => !p.ok).slice(0, 3), late: played.filter((p) => p.late).length },
        quiet: { n: quiet.length, wrong: quiet.filter((p) => !p.ok).slice(0, 3) }, empty: { f: e, text: text(e) } };
    });
    const earlyMs = /the source's ([\d.]+) s, ([\d.]+) ms (early|late)/.exec(hover.join.text);
    const shown = earlyMs ? Number(earlyMs[2]) * (earlyMs[3] === 'early' ? -1 : 1) : NaN;
    check(earlyMs && earlyMs[1] === (hover.join.at / 44100).toFixed(3) && Math.abs(shown - hover.join.ms) <= 1 && hover.join.ms < -80
      && (hover.join.code ? hover.join.text.includes(`sent frame ${hover.join.k} ·`) : !hover.join.text.includes('sent frame'))
      && hover.join.text.includes('joined the queue') && hover.join.text.startsWith(`frame ${hover.join.f} · `),
      'the lane\'s hover on the first slot of a phrase that joined the queue names the source\'s second, how early it plays (from the slot\'s centre) and "joined the queue", and the sent frame\'s number only where the played code is not 0',
      hover.join.text);
    check(hover.played.n > 100 && hover.played.wrong.length === 0 && hover.played.late >= 1,
      'on every played slot the hover gives the sent frame\'s number by the rule, the look-ahead included (some slots sit 324 samples or more into their frame at 24 kHz)',
      `${hover.played.n} slots, ${hover.played.late} of them 324 or more into the frame${hover.played.wrong.length ? `; wrong: ${hover.played.wrong.map((p) => p.t).join(' | ')}` : ''}`);
    check(hover.quiet.n >= 1 && hover.quiet.wrong.length === 0,
      'a slot that plays the source but whose played code is 0 gives no sent frame\'s number and keeps the source\'s second',
      `${hover.quiet.n} slots${hover.quiet.wrong.length ? `; wrong: ${hover.quiet.wrong.map((p) => p.t).join(' | ')}` : ''}`);
    check(/· silence$/.test(hover.empty.text) && !hover.empty.text.includes('sent frame') && !hover.empty.text.includes('source\'s'),
      'the hover on an empty slot of the queue says "silence" and gives no frame number', hover.empty.text);
    // The hover under the crosshair at each whole pixel of the whole view
    // (laneHoverAt, as drawHover calls it): a pixel drawn in the mark's colour
    // names the skips drawn there, summed, with their count when more than
    // one; any other pixel names none.
    const wholeLane = await laneRow(page, [0, 31]);
    const atPixels = await page.evaluate(() => {
      const w = document.getElementById('visualizer').getBoundingClientRect().width, range = visibleRange(audibleBuffer());
      return Array.from({ length: Math.floor(w) }, (_, x) => laneHoverAt(w, range, x));
    });
    const marked = [], wrongPixels = [];
    atPixels.forEach((t, x) => {
      const there = queue.heard.filter((d) => pixelOf(wholeLane, d.time) === x), lit = wholeLane.row[Math.floor(x * wholeLane.scale)] === white;
      const sum = there.reduce((a, d) => a + d.ms, 0);
      const ok = lit ? there.length > 0 && t.includes(`queue overflow: ${sum.toFixed(1)} ms skipped`) && (there.length > 1 ? t.includes(`(${there.length} skips)`) : !t.includes('skips)'))
        : !t.includes('queue overflow');
      if (lit) marked.push(there.length);
      if (!ok) wrongPixels.push(`${x}: ${t}`);
    });
    check(wrongPixels.length === 0 && marked.some((n) => n >= 2) && marked.some((n) => n === 1),
      'hovered at each whole pixel, the lane names the skips drawn on the crosshair\'s pixel, summed, with their count when more than one, and none elsewhere',
      `${marked.length} marked pixels, ${marked.filter((n) => n > 1).length} with more than one skip${wrongPixels.length ? `; wrong at ${wrongPixels.slice(0, 2).join(' | ')}` : ''}`);

    // 4. The legend on the queue.
    const legendOf = () => page.evaluate(() => ({ items: [...document.querySelectorAll('#viz-legend .lg-item')].map((e) => ({ text: e.textContent, title: e.title,
      box: !!e.querySelector('.lg-box'), mark: !!e.querySelector('.lg-mark') })), head: (document.querySelector('#viz-legend b') || {}).title }));
    const legend = await legendOf(), sumMs = Math.round(queue.heard.reduce((s, d) => s + d.ms, 0));
    const skipItem = legend.items.filter((i) => i.mark);
    check(skipItem.length === 1 && skipItem[0].text === `skips ${queue.heard.length} · ${sumMs} ms` && !skipItem[0].box && /Each mark is one skip\./.test(skipItem[0].title)
      && legend.items.some((i) => i.box && /^silence \d+$/.test(i.text) && i.title.includes('nothing of the source plays here'))
      && !legend.items.some((i) => /^not sent/.test(i.text)) && /what plays in each 20 ms of the render/i.test(legend.head),
      'on the queue the legend counts the heard skips and their sound, names empty slots "silence", and its heading says the lane shows what plays',
      legend.items.map((i) => i.text).join(', '));

    // The test is channel.source: a channel of counts alone (a live take,
    // W3-02c-3b) keeps the lane, its hover and legend words as they are.
    const counts = await page.evaluate(() => {
      const info = { ...state.lastCodecInfo, channel: { opens: 1, appended: 0, droppedSamples: 0 } };
      return { onQueue: laneOnQueue(info), skips: laneSkips(info).length, text: laneHoverText(info, 0.5, 1e-4), name: frameStyle(info, 0).name,
        start: frameStart(info, 10) };
    });
    check(!counts.onQueue && counts.skips === 0 && counts.name === 'not sent' && Math.abs(counts.start - (10 * 480 - 156) / 24000) < 1e-12 && !/source's|silence/.test(counts.text),
      'a render whose channel has no source map is not on the queue for the lane: no marks, "not sent", the look-ahead kept', counts.text);

    // 5 and 6. A take made from the page's own render options with another
    // seed of the sender's clock, 0.25 s late and at half level. The seed is
    // the first from 1 at which, at some pause, the take's kind of change
    // (early, kept or late at 80 ms) differs from the page's render's.
    const made = await page.evaluate(async () => {
      const kind = (ms) => (ms === null ? null : ms <= -80 ? 'early' : ms >= 80 ? 'late' : 'kept');
      const Y = state.lastCodecInfo.channel.spurts, source = captureSource(state.decodedSource, renderOptions().captureChannel);
      for (let seed = 1; seed <= 12; seed++) {
        const r = await TF2Audio.process(source, { ...renderOptions(), seed });
        const X = r.codecInfo.channel.spurts;
        const differ = Y.slice(1).map((s, j) => (Y[j].end + s.start) / 2).filter((at) => kind(changeAt(X, at)) !== kind(changeAt(Y, at)));
        if (!differ.length) continue;
        window.__takeSpurts = X;
        const rate = state.processedRate, sim = r.samples;
        const shifted = TF2Reference.warp(sim, rate, { offsetSeconds: .25, scale: 1 }, rate, sim.length + rate);
        return { seed, X, differ, wav: [...new Uint8Array(await TF2Audio.encodeWav(shifted.map((v) => v * .5), rate).arrayBuffer())] };
      }
      return null;
    });
    check(!!made, 'a seed of the sender\'s clock from 1 to 12 gives the take another kind of change than the page\'s render at some pause',
      made ? `seed ${made.seed}: the take's phrases ${earlyOf(made.X).join(' and ')} start early, the render's ${earlyOf(queue.spurts).join(' and ')}` : 'none');
    await page.locator('#reference summary').click();
    await markReport();
    await page.locator('#reference-file').setInputFiles({ name: 'take-phrases.wav', mimeType: 'audio/wav', buffer: Buffer.from(made.wav) });
    await reportReady();
    // The kinds of each change by the rule, from the take's own phrases (X)
    // and the render's (Y), against the panel's.
    const judge = (p, Y) => page.evaluate(({ p, X, Y }) => {
      const kind = (ms) => (ms === null ? null : ms <= -80 ? 'early' : ms >= 80 ? 'late' : 'kept');
      return p.changes.map((c) => {
        const tx = changeAt(X, c.at), ty = changeAt(Y, c.at);
        return { at: c.at, take: c.takeMs, truth: tx, takeKind: c.takeKind, want: kind(tx), renderKind: c.renderKind, wantR: kind(ty),
          ok: c.takeKind === kind(tx) && c.renderKind === kind(ty) && tx !== null && c.takeMs !== null && Math.abs(c.takeMs - tx) <= 60 };
      });
    }, { p, X: made.X, Y });
    const describe = (rows) => rows.map((r) => `${r.at.toFixed(2)} s ${r.takeKind}/${r.want} ${r.take === null ? '—' : Math.round(r.take)}/${r.truth === null ? '—' : Math.round(r.truth)} ${r.renderKind}`).join('; ');
    const onQueue = await panel();
    // The status line's counts, from the take's pieces.
    const statusCounts = (p) => {
      const between = p.pieces.filter((g, i) => i > 0 && g !== p.pieces[i - 1]).length;
      const m = /(\d+) changes? between phrases, (\d+) within a phrase/.exec(p.status);
      return { ok: !!m && Number(m[1]) === between && Number(m[2]) === p.pieces.length - 1 - between, between, within: p.pieces.length - 1 - between };
    };
    const sq = statusCounts(onQueue);
    check(onQueue.guided && sq.ok && /\(take minus render; \d+ changes? between phrases, \d+ within a phrase\)/.test(onQueue.status)
      && onQueue.status.includes(`${onQueue.pieces.length} pieces`) && / phrases in \d+ pieces/.test(onQueue.status)
      && !/5\.8|trim|re-timing/.test(onQueue.status),
      'lined up against the render, the status line says take minus render and counts the changes between phrases and within one as the take\'s pieces have them, with no 5.8 ms trims',
      `${sq.between} between, ${sq.within} within; ${onQueue.status}`);
    const rows = await judge(onQueue, onQueue.render);
    check(rows.length >= 8 && rows.every((r) => r.ok),
      'each change from one phrase to the next has the take\'s kind of change by its own phrases and the render\'s by the render\'s, and the take\'s change within 60 ms', describe(rows));
    check(rows.some((r) => (r.takeKind === 'early' && r.renderKind === 'kept') || (r.takeKind === 'kept' && r.renderKind === 'early')),
      'at some change the take starts early and the render keeps the pause, or the other way round', describe(rows.filter((r) => r.takeKind !== r.renderKind)));
    // Each entry of the list of changes: its time, the take's change | the render's, in ms.
    const msText = (v) => (v === null ? '—' : `${Math.round(v) < 0 ? '−' : '+'}${Math.abs(Math.round(v))}`);
    const listHolds = (p, list) => p.changes.slice(0, 30).every((c, i, all) => list.includes(`${i ? '; ' : 'ms: '}${c.at.toFixed(2)} s ${msText(c.takeMs)} | ${msText(c.renderMs)}${i + 1 < all.length || p.changes.length > 30 ? ';' : '.'}`));
    const counted = (p) => {
      const n = p.changes.length, T = p.changes.filter((c) => c.takeKind === 'early').length, R = p.changes.filter((c) => c.renderKind === 'early').length;
      const G = p.changes.filter((c) => c.takeKind !== null && c.takeKind === c.renderKind).length;
      return { n, T, R, G };
    };
    const c1 = counted(onQueue), sentence1 = onQueue.lines.find((l) => l.startsWith('Phrase starts:')) || '', list1 = onQueue.lines.find((l) => l.startsWith('Take | render, ms:')) || '';
    check(sentence1 === `Phrase starts: at ${c1.n} changes from one phrase to the next the take starts early (by 80 ms or more) at ${c1.T} and the render at ${c1.R}; they are of one kind (early, kept or late) at ${c1.G} of ${c1.n}.`
      && listHolds(onQueue, list1),
      'the panel says at how many changes the take and the render start early and how many are of one kind, and lists each change as the take\'s change | the render\'s', `${sentence1} ${list1}`);

    // changeAt with phrases made by hand.
    const hand = await page.evaluate(() => {
      const p = (start, end, offsetStartMs, offsetEndMs) => ({ start, end, offsetStartMs, offsetEndMs });
      const three = [p(0, 1.45, 0, -10), p(1.55, 1.65, -300, -310), p(1.75, 3, 20, 0)];   // pauses with middles at 1.5 and 1.7 s
      return { none: changeAt(null, 1.5), far: changeAt(three, 2.5), edge: changeAt(three, 1.91), inside: changeAt(three, 1.89),
        first: changeAt(three, 1.58), second: changeAt(three, 1.62), nul: changeAt([p(0, 1, 0, null), p(2, 3, -300, -310)], 1.5) };
    });
    check(hand.none === null && hand.far === 0 && hand.edge === 0 && hand.inside === 330 && hand.first === -290 && hand.second === 330 && hand.nul === null,
      'changeAt: no phrases give null; no pause within 0.2 s gives 0; of two pauses the nearer is taken; a null offset gives null', JSON.stringify(hand));

    // A render with loss at another frame rate, made after the alignment: the
    // take is not lined up again, and its changes still take the render it was
    // lined up with, while the render's are the new render's.
    const takeBefore = await page.evaluate(() => { window.__aligned = state.realTake; return state.realTake.timeline.segments.length; });
    await markReport();
    await renderAfter('fps_max 67; net_fakeloss 20');
    await reportReady();
    const lossy = await panel(), stillAligned = await page.evaluate(() => state.realTake === window.__aligned && state.lastCodecInfo.lostFrames > 0 && state.lastCodecInfo.channel.fps === 67);
    const rowsLossy = await judge(lossy, lossy.render);
    const c2 = counted(lossy);
    check(stillAligned && takeBefore > 1 && lossy.guide !== null && rowsLossy.length >= 8 && rowsLossy.every((r) => r.ok)
      && lossy.lines.some((l) => l.includes(`the take starts early (by 80 ms or more) at ${c2.T} and the render at ${c2.R}; they are of one kind (early, kept or late) at ${c2.G} of ${c2.n}.`)),
      'after a render with loss at 67 frames a second the take keeps its alignment; its kinds of change still come from the render it was lined up with, and the render\'s from the render on screen',
      describe(rowsLossy));

    // The file's own timing rendered after: the take is lined up again
    // against that render, which starts no phrase early.
    await markReport();
    await renderAfter('net_fakeloss 0; fps_max 300');
    await reportReady();
    await markReport();
    await renderAfter('voice_timeline source');
    await reportReady();
    const own = await panel();
    const rowsOwn = await page.evaluate(({ p, X }) => {
      const kind = (ms) => (ms === null ? null : ms <= -80 ? 'early' : ms >= 80 ? 'late' : 'kept');
      return p.changes.map((c) => ({ at: c.at, take: c.takeMs, truth: changeAt(X, c.at), takeKind: c.takeKind, want: kind(changeAt(X, c.at)), renderKind: c.renderKind,
        ok: c.takeKind === kind(changeAt(X, c.at)) && c.renderMs === null }));
    }, { p: own, X: made.X });
    const c3 = counted(own);
    check(own.guided && own.guide === null && rowsOwn.length >= 8 && rowsOwn.every((r) => r.ok)
      && own.lines.includes(`Phrase starts: at ${c3.n} changes from one phrase to the next the take starts early (by 80 ms or more) at ${c3.T}. This render keeps the file's own timing and starts none early.`)
      && listHolds(own, own.lines.find((l) => l.startsWith('Take | render')) || ''),
      'against a render on the file\'s own timing the take is lined up again with no phrases kept, its kinds of change still hold, and the panel says the render starts none early',
      describe(rowsOwn));

    // 5, the other form: a take lined up after a render with loss has no
    // render to guide it.
    await markReport();
    await renderAfter('net_fakeloss 20');
    await reportReady();
    await markReport();
    await page.locator('#reference-file').setInputFiles({ name: 'take-phrases-again.wav', mimeType: 'audio/wav', buffer: Buffer.from(made.wav) });
    await reportReady();
    const unguided = await panel();
    check(!unguided.guided && statusCounts(unguided).ok && /\(take minus source; \d+ changes? between phrases, \d+ within a phrase\)/.test(unguided.status),
      'a take lined up after a render with loss is lined up against the source, and the status line says take minus source', unguided.status);

    // 2, 4 and 3 off the queue: the file's own timing (the render on screen
    // has loss; the lane is drawn the same way).
    await page.locator('#reference-clear').click();
    await renderAfter('net_fakeloss 0');
    const ownLane = await laneRow(page, [0, 31]), ownFirst = await laneRow(page, [0, 1]);
    const ownLegend = await legendOf();
    const ownText = await page.evaluate(() => {
      const info = state.lastCodecInfo, out = [];
      // main's text, as main wrote it, for a coded slot and an empty one.
      const mainStart = (f) => (f * info.frameSamples - info.lookahead) / info.sampleRate;
      const mainAt = (t) => Math.floor((t * info.sampleRate + info.lookahead) / info.frameSamples);
      const coded = info.frameLog.findIndex((c, f) => c === 1 || c === 2 || c === 3), empty = info.frameLog.findIndex((c) => c === 0);
      for (const f of [coded, empty, info.frames - 1]) {
        const t = mainStart(f) + 0.01, code = info.frameLog[f], bytes = info.frameBytes[f];
        let want = `frame ${mainAt(t)} · ${formatTime(Math.max(0, mainStart(f)), 3)} · ${FRAME_STYLE[code].name}`;
        if (bytes && code !== 0) want += ` · ${bytes} B (${(bytes * 8 / (info.frameMs || 20)).toFixed(1)} kbps)`;
        out.push({ want, got: laneHoverText(info, t, 0.02) });
      }
      return { onQueue: laneOnQueue(info), out, start: frameStart(info, 10), at: frameAt(info, (10 * 480 - 156) / 24000 + 0.01) };
    });
    check(!ownText.onQueue && Math.abs(ownText.start - (10 * 480 - 156) / 24000) < 1e-12 && ownText.at === 10,
      'on the file\'s own timing frameStart and frameAt keep the look-ahead, as on main', `${ownText.start}`);
    check(ownLane.row.every((c) => c !== white) && ownFirst.row.every((c) => c !== white),
      'on the file\'s own timing the lane draws no pixel in the mark\'s colour');
    check(!ownLegend.items.some((i) => i.mark) && ownLegend.items.some((i) => /^not sent \d+$/.test(i.text)) && !ownLegend.items.some((i) => /^silence/.test(i.text))
      && /What the voice path did with each 20 ms frame/.test(ownLegend.head),
      'on the file\'s own timing the legend has no skips, says "not sent", and keeps its heading\'s title', ownLegend.items.map((i) => i.text).join(', '));
    check(ownText.out.every((o) => o.got === o.want), 'on the file\'s own timing the lane\'s hover is main\'s text, character for character',
      ownText.out.map((o) => o.got).join(' | '));

    // 2: a skip past the source's end draws nothing. A 1 s tone ends in sound;
    // with a room the render runs past the source.
    await page.evaluate(() => { execCommand('voice_timeline game'); execCommand('dsp_room 6'); });
    await chooseFile(page, { name: 'tone-1s.wav', mimeType: 'audio/wav', buffer: wavTone(1) }, 120000);
    const tone = await page.evaluate(() => {
      const info = state.lastCodecInfo, end = state.renderedSource.duration;
      return { end, render: state.processedBuffer.length / state.processedRate, room: !!info.room, onQueue: laneOnQueue(info),
        heard: info.channel.drops.filter((d) => d.time < end), past: info.channel.drops.filter((d) => d.time >= end) };
    });
    const toneLane = await laneRow(page, null), toneMarks = marksMatch(toneLane, tone.heard, white);
    const pastPixels = tone.past.map((d) => pixelOf(toneLane, d.time));
    const toneLegend = await legendOf(), toneSkip = toneLegend.items.find((i) => i.mark);
    check(tone.room && tone.onQueue && tone.render > tone.end + 0.5 && tone.past.length >= 1
      && pastPixels.every((x) => x < toneLane.row.length && toneLane.row[x] !== white) && toneMarks.stray.length === 0 && toneMarks.missing.length === 0
      && (tone.heard.length ? toneSkip && toneSkip.text.startsWith(`skips ${tone.heard.length} · `) : !toneSkip),
      'a skip past the source\'s end (a 1 s tone, with a room, so the render runs on) gets no mark and is left out of the legend\'s count',
      `past the end: ${tone.past.map((d) => `${d.time.toFixed(4)} s, ${d.ms.toFixed(1)} ms`).join('; ')}; heard ${tone.heard.length}; render ${tone.render.toFixed(2)} s`);
    check(errors.length === 0, 'the lane and the panel on the game\'s voice queue: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// W3-02d-2: a source longer than 60 s renders again by itself after a change
// that needs no new encode, when the page's worker still holds what the render
// on screen left and that render took at most AUTO_RENDER_KEPT_MS on this
// device (reconcileRender, rendersFromKept). A change that needs a new encode
// marks the render, as before. A source of 60 s or less is checked by the
// sections above, unchanged.
// A synthetic Steam-voice demo of more than 60 s, one speaker in universe 0 (no
// account can have it), two talk spurts of 1 s, the second 64 s after the
// first: written as tests/demo.verify.mjs writes its demo (the same layout,
// cut down to what this needs).
async function longDemo() {
  const opus = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'vendor', 'libopus-1.1', 'index.mjs')).href);
  const bits = [];
  let at = 0;
  const write = (value, n) => { for (let i = 0; i < n; i++, at++) { if ((at & 7) === 0) bits.push(0); if (Math.floor(value / 2 ** i) % 2) bits[bits.length - 1] |= 1 << (at & 7); } };
  const message = (fill) => { bits.length = 0; at = 0; fill(); return Uint8Array.from(bits); };
  const crc32 = (d) => { let c = 0xFFFFFFFF; for (const b of d) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; };
  const payload = (frames) => {
    const op = [];
    for (const f of frames) { if (f === 'end') op.push(0xFF, 0xFF); else op.push(f.data.length & 255, f.data.length >> 8, f.seq & 255, f.seq >> 8, ...f.data); }
    const id = new DataView(new ArrayBuffer(8)); id.setBigUint64(0, 4503603922337793n, true);
    const body = [...new Uint8Array(id.buffer), 11, 24000 & 255, 24000 >> 8, 6, op.length & 255, op.length >> 8, ...op], c = crc32(body);
    return Uint8Array.from([...body, c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24]);
  };
  const rate = 24000, encoder = await opus.createEncoder({ sampleRate: rate, channels: 1, bitrate: 32000, vbr: true, complexity: 10 });
  const spurt = (from, seq) => [...Array.from({ length: 50 }, (_, k) => ({ seq: seq + k,
    data: encoder.encodeFloat(Float32Array.from({ length: 480 }, (_, i) => .2 * Math.sin(2 * Math.PI * 180 * (480 * (from + k) + i) / rate))) })), 'end'];
  const first = spurt(0, 100), second = spurt(50, 200);
  encoder.free();
  const voice = (frames) => () => { write(15, 6); write(1, 8); write(0, 8); const p = payload(frames); write(p.length * 8, 16); for (const b of p) write(b, 8); };
  const init = () => { write(3, 6); write(1234, 32); write(15, 16); write(1, 16); write(14, 6); for (const ch of 'steam') write(ch.charCodeAt(0), 8); write(0, 8); write(255, 8); write(0, 16); };
  const packets = [{ tick: 100, fill: init }];
  for (const [frames, tick] of [[first, 200], [second, 200 + Math.round(64 / 0.015)]]) {
    for (let k = 0; k < frames.length; k += 5) packets.push({ tick: tick + Math.round(k * 0.02 / 0.015), fill: voice(frames.slice(k, k + 5)) });
  }
  const header = new Uint8Array(1072), dv = new DataView(header.buffer);
  header.set([...'HL2DEMO'].map((c) => c.charCodeAt(0))); dv.setInt32(8, 3, true); dv.setInt32(12, 24, true);
  header.set([...'Synthetic test'].map((c) => c.charCodeAt(0)), 16); header.set([...'ctf_2fort'].map((c) => c.charCodeAt(0)), 536);
  dv.setFloat32(1056, 70, true); dv.setInt32(1060, 4700, true); dv.setInt32(1064, packets.length, true);
  const parts = [header];
  for (const { tick, fill } of packets) {
    const data = message(fill), frame = new Uint8Array(93 + data.length), fv = new DataView(frame.buffer);
    frame[0] = 2; fv.setInt32(1, tick, true); fv.setUint32(89, data.length, true); frame.set(data, 93);
    parts.push(frame);
  }
  parts.push(Uint8Array.of(7, 0, 0, 0, 0));
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

async function verifyAutoRerender(browser, base) {
  console.log('\n[Browser 8d] A longer source renders again by itself after a change on the receiver\'s side (W3-02d-2)');
  const errors = [];
  const fresh = async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };
  const long = { name: 'long-speech.wav', mimeType: 'audio/wav', buffer: wavSpeech(61) };
  let marks = 0;
  // Make a change, then wait: for the render it starts to end (and 600 ms
  // more, in which a second would have started), or `wait` ms with none.
  // Returns the renders started since, and the page after them.
  const afterChange = async (page, change, wait = 1500) => {
    const mark = `test: W3-02d-2 change ${++marks}`;
    const r = await page.evaluate((m) => { logLine(m, 'sys'); return state.renderId; }, mark);
    await change();
    await page.waitForFunction((n) => !renderIdle() || state.renderId > n, r, { timeout: wait }).catch(() => {});
    await page.waitForFunction(() => renderIdle(), null, { timeout: 120000 });
    await page.waitForTimeout(600);
    return page.evaluate(({ m, r }) => {
      const lines = [...document.getElementById('console-out').children].map((e) => e.textContent), since = lines.slice(lines.lastIndexOf(m) + 1);
      return { started: since.filter((l) => l.startsWith('S_StartSound: initializing render')).length, renders: state.renderId - r,
        from: state.renderedFrom === undefined ? 'none' : state.renderedFrom, rendered: state.renderedKey === currentRenderKey(), stale: state.stale,
        marked: state.stale && els.renderStatus.textContent === STALE_TEXT, processing: state.processing,
        line: since.filter((l) => l.startsWith('ChangeLevel: rendered')).at(-1) || null };
    }, { m: mark, r });
  };
  // Cancel the render that runs (or is about to), from the page, once its
  // progress has reached `percent`.
  const cancelAt = (page, percent = 0) => page.evaluate((p) => new Promise((resolve) => {
    const tick = setInterval(() => {
      if (state.processing && state.cancelProcessing && (!els.progress || els.progress.value >= p)) { clearInterval(tick); els.cancel.click(); resolve(); }
    }, 5);
  }), percent).then(() => page.waitForFunction(() => !state.processing, null, { timeout: 60000 }));
  const one = (x) => x.started === 1 && x.renders === 1 && x.rendered && !x.stale && x.from === 'b' && /from the kept codec result$/.test(x.line || '');
  const none = (x) => x.started === 0 && x.renders === 0 && !x.processing;

  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, long, 120000);
      const first = await page.evaluate(() => ({ took: state.renderedTook, limit: AUTO_RENDER_KEPT_MS, kept: state.workerKeepsShown, from: state.renderedFrom }));
      check(first.took > 0 && first.took <= first.limit && first.kept && first.limit === 30000 && first.from === null,
        'a 61 s source: its first render took under AUTO_RENDER_KEPT_MS (30,000 ms) on this machine, the worker started it from the start (startedFrom null), and the page holds that its worker keeps that render\'s stages',
        `${first.took} ms; from ${first.from}`);

      // Volume, changed twice within 400 ms: one render, of the last value, from the kept codec result.
      const volume = await afterChange(page, async () => { await setControl(page, 'volume', '0.5'); await page.waitForTimeout(100); await setControl(page, 'volume', '0.6'); });
      const shown = await wavHash(page), afresh = await freshHash(page);
      check(one(volume) && await page.evaluate(() => JSON.parse(state.renderedKey).volume === 0.6),
        'a 61 s source: volume changed twice within 400 ms starts exactly one render by itself, of the last value, and the worker started it from the kept codec result',
        JSON.stringify(volume));
      check(shown === afresh, 'that render is, byte for byte, a render made afresh on the page\'s own thread', `${shown.slice(0, 12)} / ${afresh.slice(0, 12)}`);
      // fps_max, Phrase timing and the room: each one render, from the kept codec result.
      for (const [label, id, value] of [['fps_max 67', 'fps', '67'], ['Phrase timing set to the file\'s own timing', 'timeline', 'source'],
        ['the room (a small room)', 'listener_position', 'auto_small_room']]) {
        const got = await afterChange(page, () => setControl(page, id, value));
        check(one(got), `a 61 s source: ${label} starts exactly one render by itself, from the kept codec result`, JSON.stringify(got));
      }

      // A change that needs a new encode: marked, and no render starts.
      // vad_threshold -30: a name the key on screen does not hold (at the codec's own -40 the page sends none).
      for (const [label, id, value, back] of [['snd_bits 8', 'bits', '8', '16'], ['net_fakeloss 5', 'loss', '5', '0'], ['vad_threshold -30', 'vad_threshold', '-30', '-40']]) {
        const got = await afterChange(page, () => setControl(page, id, value));
        check(none(got) && got.marked, `a 61 s source: ${label} marks the render and starts none`, JSON.stringify(got));
        await setControl(page, id, back);
      }
      const both = await afterChange(page, () => page.evaluate(() => {
        for (const [el, v] of [[els.volume, '0.7'], [els.bits, '8']]) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }));
      check(none(both) && both.marked, 'a 61 s source: volume and snd_bits changed together mark the render and start none', JSON.stringify(both));
      await page.evaluate(() => { for (const [el, v] of [[els.volume, '0.6'], [els.bits, '16']]) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } });

      // Rule D: the render on screen's time over the limit, or 0 (not known): marked.
      const took = await page.evaluate(() => state.renderedTook);
      for (const [label, value] of [['over the limit', 'over'], ['0', 0]]) {
        await page.evaluate((v) => { state.renderedTook = v === 'over' ? AUTO_RENDER_KEPT_MS + 1 : v; }, value);
        const got = await afterChange(page, () => setControl(page, 'volume', '0.5'));
        check(none(got) && got.marked, `a 61 s source, with the render on screen's time ${label}: a changed volume marks the render and starts none`, JSON.stringify(got));
        await setControl(page, 'volume', '0.6');
      }
      await page.evaluate((t) => { state.renderedTook = t; }, took);

      // A render the user cancelled does not start again by itself on a return to its settings.
      const cancelled = await afterChange(page, async () => {
        await setControl(page, 'volume', '0.3');
        await cancelAt(page);
        await setControl(page, 'volume', '0.6');
        await setControl(page, 'volume', '0.3');
      });
      check(cancelled.started === 1 && cancelled.renders === 0 && cancelled.marked && !cancelled.processing,
        'a 61 s source: an automatic render the user cancelled is not started again by a return to the same settings (one started, the cancelled one)', JSON.stringify(cancelled));
      await setControl(page, 'volume', '0.6');

      // The reviewer's sequence: snd_bits 8; Render; Cancel in the middle of
      // the encode; snd_bits back and volume changed. The engine let go of the
      // codec's result the render on screen left: marked, none starts.
      const sequence = await afterChange(page, async () => {
        await setControl(page, 'bits', '8');
        await page.locator('#process').click();
        await cancelAt(page, 10);
        await setControl(page, 'bits', '16');
        await setControl(page, 'volume', '0.7');
      });
      check(sequence.started === 1 && sequence.renders === 0 && sequence.marked && !sequence.processing,
        'a 61 s source: snd_bits changed, Render, Cancel during the encode, snd_bits back and volume changed: the render is marked and none starts by itself (one started, the cancelled one)',
        JSON.stringify(sequence));
      await renderNow(page, 120000);
      const pressed = await page.evaluate(() => state.renderedFrom);
      const again = await afterChange(page, () => setControl(page, 'volume', '0.8'));
      check(pressed === 'a' && one(again), 'the press started from the kept capture signal (startedFrom \'a\'); after it a changed volume starts exactly one render by itself, from the kept codec result',
        `the press started from ${pressed}; ${JSON.stringify(again)}`);

      // The page's worker ended (as after a cancel that does not stop in time): marked.
      await page.evaluate(() => dropPageWorker());
      const dropped = await afterChange(page, () => setControl(page, 'volume', '0.9'));
      check(none(dropped) && dropped.marked, 'a 61 s source: after the page\'s worker is ended, a changed volume marks the render and starts none', JSON.stringify(dropped));
    } finally { await context.close(); }
  }

  // No render of the source on screen: its first render cancelled.
  {
    const { context, page } = await fresh();
    try {
      await page.locator('#file').setInputFiles(long);
      await cancelAt(page);
      const alone = await afterChange(page, () => setControl(page, 'volume', '0.5'));
      check(none(alone) && await page.evaluate(() => state.renderedSource !== state.decodedSource),
        'a 61 s source whose first render was cancelled: a changed volume starts no render', JSON.stringify(alone));
      // Rule A on its own: the mark, the time and the key set by hand as if a render were on screen.
      await page.evaluate(() => { state.workerKeepsShown = true; state.renderedTook = 1000; state.renderedKey = currentRenderKey(); });
      const forced = await afterChange(page, () => setControl(page, 'volume', '0.4'));
      check(none(forced), 'with the other rules\' state set by hand as if a render were on screen, a changed volume still starts none (rule A)', JSON.stringify(forced));
    } finally { await context.close(); }
  }

  // A recorded live take of 90 s: marked, none starts, also with a time under the limit set by hand (rule C).
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'before.wav', mimeType: 'audio/wav', buffer: wavSpeech(2) });
      await page.evaluate(() => {
        const rate = 48000, n = 90 * rate, dry = Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 300 * i / rate));
        mountLiveTake({ dry, wet: dry.slice(), rate, frameLog: new Int8Array(90 * 50).fill(2),
          counts: { modes: { hybrid: 4500 }, spurts: 1, gated: 0, frames: 4500, dtx: 0, lost: 0, late: 0 },
          info: { codec: 'steam', realOpus: true, version: 'test', bitrate: 32000, vbr: true, dtx: true, gate: -40, autoGain: true, voiceRate: 44100, frameSamples: 480 } });
      });
      const take = await afterChange(page, () => setControl(page, 'volume', '0.5'));
      check(none(take) && take.marked, 'a 90 s live take: a changed volume marks it and starts no render', JSON.stringify(take));
      await page.evaluate(() => { state.renderedTook = 1000; });
      const timed = await afterChange(page, () => setControl(page, 'volume', '0.4'));
      check(none(timed) && timed.marked, 'a 90 s live take with its time set under the limit by hand: a changed volume still marks it and starts none (rule C)', JSON.stringify(timed));
    } finally { await context.close(); }
  }
  // The worker unavailable (the page opened from file://, the codec skipped):
  // a render made on the page's own thread leaves rule C's mark clear.
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`file://${path.join(__dirname, '..', 'index.html')}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => execCommand('snd_codec 0'));
      await chooseFile(page, long, 120000);
      const offWorker = await page.evaluate(() => ({ worker: canUseWorker(), kept: state.workerKeepsShown, from: state.renderedFrom === undefined ? 'none' : state.renderedFrom }));
      const got = await afterChange(page, () => setControl(page, 'volume', '0.5'));
      check(!offWorker.worker && !offWorker.kept && offWorker.from === 'none' && none(got) && got.marked,
        'opened from file:// (no worker) with the codec skipped, a 61 s source: the render was made on the page\'s own thread, and a changed volume marks it and starts none',
        `${JSON.stringify(offWorker)}; ${JSON.stringify(got)}`);
    } finally { await context.close(); }
  }

  // A demo of more than 60 s: a changed volume renders by itself from the kept
  // capture signal (a demo has no codec stage of the page's). Then a changed mic gain (left out of a demo's key) and then a
  // changed volume. The engine's key of the kept capture signal holds the mic
  // gain, so the render would start from the start: it is marked.
  {
    const { context, page } = await fresh();
    try {
      await chooseFile(page, { name: 'long.dem', mimeType: 'application/octet-stream', buffer: await longDemo() }, 120000);
      const demo = await page.evaluate(() => ({ demo: !!state.sourceDemo, seconds: state.decodedSource.duration, kept: state.workerKeepsShown }));
      const plain = await afterChange(page, () => setControl(page, 'volume', '0.8'));
      check(demo.demo && demo.seconds > 60 && demo.kept && plain.started === 1 && plain.renders === 1 && plain.from === 'a' && !plain.stale,
        'a demo of more than 60 s: a changed volume starts one render by itself, from the kept capture signal', `${demo.seconds.toFixed(1)} s; ${JSON.stringify(plain)}`);
      const gain = await afterChange(page, () => setControl(page, 'gain', '2'));
      const got = await afterChange(page, () => setControl(page, 'volume', '0.5'));
      check(none(gain) && none(got) && got.marked,
        'then mic gain changed (no render: a demo\'s key leaves it out), then volume: the render is marked and none starts', JSON.stringify(got));
    } finally { await context.close(); }
  }
  check(errors.length === 0, 'a longer source rendering again by itself: no page errors', errors.join('; '));
}

// W4-01a: which version this is. The footer gives the service worker's cache
// number; a newer worker taking over a page that had one shows the notice,
// and the page is not reloaded under it.
async function verifyVersionLine(browser) {
  console.log('\n[Browser 8b] The version line and the newer-version notice (W4-01a)');
  const swSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const number = Number(/CACHE_PREFIX\}v(\d+)/.exec(swSource)[1]);
  // The page's files through a route of this test's own, which can serve a
  // newer sw.js (a browser fetches a service worker's script itself, past
  // Playwright's routes).
  const upstream = await createStaticServer(path.join(__dirname, '..'));
  let newerWorker = null;
  const proxy = http.createServer((request, response) => {
    if (newerWorker && new URL(request.url, 'http://localhost').pathname === '/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      response.end(newerWorker);
      return;
    }
    const forward = http.request({ host: '127.0.0.1', port: upstream.address().port, path: request.url, method: request.method, headers: request.headers },
      (reply) => { response.writeHead(reply.statusCode, reply.headers); reply.pipe(response); });
    forward.on('error', () => { response.writeHead(502).end(); });
    request.pipe(forward);
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The first visit's takeover (the page had no worker) shows no notice,
    // only the version (review, S2).
    await page.waitForFunction(() => !!navigator.serviceWorker.controller && !document.getElementById('version-line').hidden);
    const first = await page.evaluate(() => ({ notice: document.getElementById('update-notice').hidden, footer: document.getElementById('version-line').textContent }));
    check(first.notice && first.footer === `version ${number} · `, 'the first visit\'s worker taking over shows the version and no notice', first.footer);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.getElementById('version-line').hidden);
    const footer = await page.evaluate(() => ({ text: document.getElementById('version-line').textContent, controlled: !!navigator.serviceWorker.controller,
      notice: document.getElementById('update-notice').hidden }));
    check(footer.controlled && footer.text === `version ${number} · ` && footer.notice, 'the footer shows the service worker\'s cache number, and no notice', footer.text);
    newerWorker = swSource.replace(/CACHE = `\$\{CACHE_PREFIX\}v\d+`/, `CACHE = \`\${CACHE_PREFIX}v${number + 1}\``);
    await page.evaluate(() => { window.__marker = 'still this page'; });
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await page.waitForFunction(() => !document.getElementById('update-notice').hidden, null, { timeout: 30000 });
    const after = await page.evaluate(async () => ({ marker: window.__marker, text: document.getElementById('update-notice').textContent, keys: await caches.keys(),
      footer: document.getElementById('version-line').textContent }));
    check(after.marker === 'still this page' && after.keys.includes(`tf2ve-v${number + 1}`)
      && after.text === 'A newer version of this page is ready. Reload to use it; a loaded file and its render are not kept across a reload.',
      'a newer sw.js taking over shows the notice above step 1, and the page is not reloaded under it', `${after.keys.join(', ')}; footer "${after.footer}"`);
    check(errors.length === 0, 'the version line has no page errors', errors.join('; '));
  } finally {
    await context.close();
    await new Promise((resolve) => proxy.close(resolve));
    if (upstream.closeAllConnections) upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

// A browser of its own, with these switches (the microphone refused, none):
// the full Chromium, in its new headless mode. Playwright's headless shell,
// its default, has no permission prompt at all: a page without the
// permission gets NotSupportedError ("Not supported") there, where a browser
// that can ask gets NotAllowedError on a refusal.
async function launchBrowser(args) {
  const options = { headless: true, args };
  if (process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
  else options.channel = 'chromium';
  try { return await chromium.launch(options); }
  catch (error) {
    if (!String(error.message).includes('Executable doesn\'t exist')) throw error;
    return chromium.launch({ ...options, channel: 'chrome' });
  }
}

// The contrast of an element's text against what is behind it: its own
// background and its ancestors', composited until one is opaque (as the
// audit computed it).
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const rgba = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); const v = m ? m[1].split(',').map(Number) : [0, 0, 0, 0]; return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    const c = rgba(getComputedStyle(n).backgroundColor);
    if (c[3] > 0) layers.push(c);
    if (c[3] >= 1) break;
  }
  let bg = [0, 0, 0];
  if (!layers.length || layers[layers.length - 1][3] < 1) bg = rgba(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
  for (const c of layers.reverse()) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
  const fg = rgba(getComputedStyle(el).color);
  const text = bg.map((v, i) => fg[i] * fg[3] + v * (1 - fg[3]));
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(text), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}, selector);

// W4-01c: keyboard, the microphone's refusal, the phone, what a screen reader
// is given.
async function verifyAccess(browser, base) {
  console.log('\n[Browser 9] Keyboard, the microphone refused, the phone, the screen reader (W4-01c)');
  const errors = [];
  const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['microphone'], viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });

    // 1. The console's input lets Tab go.
    await page.locator('#console-details summary').click();
    const input = page.locator('#console-input');
    const focused = () => page.evaluate(() => document.activeElement && document.activeElement.id);
    await input.fill('');
    await input.focus();
    await page.keyboard.press('Tab');
    const emptyTab = await focused();
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    const emptyBack = await focused();
    // A word no command starts with: Tab moves on (review, N5).
    await input.fill('zzqq');
    await input.focus();
    await page.keyboard.press('Tab');
    const noMatch = { focus: await focused(), value: await input.inputValue() };
    check(noMatch.focus !== 'console-input' && noMatch.value === 'zzqq', 'console: with a word no command starts with, Tab leaves it', JSON.stringify(noMatch));
    await input.fill('voice_sc');
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    const typedBack = { focus: await focused(), value: await input.inputValue() };
    await input.focus();
    await page.keyboard.press('Tab');
    const completed = { focus: await focused(), value: await input.inputValue() };
    await page.keyboard.press('Shift+Tab');
    const completedBack = await focused();
    check(emptyTab !== 'console-input' && emptyBack !== 'console-input', 'console: with the input empty, Tab and Shift+Tab leave it', `${emptyTab} / ${emptyBack}`);
    check(completed.value === 'voice_scale ' && completed.focus === 'console-input', 'console: with "voice_sc" typed, Tab completes to "voice_scale " and the focus stays', JSON.stringify(completed));
    check(typedBack.focus !== 'console-input' && typedBack.value === 'voice_sc' && completedBack !== 'console-input',
      'console: Shift+Tab leaves it, a word typed or completed', `${typedBack.focus} / ${completedBack}`);
    await input.focus();
    const ring = await input.evaluate((el) => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
    check(ring.style !== 'none' && ring.width >= 2, 'console: its input shows the focus ring the other controls have', JSON.stringify(ring));

    // 3. The console is not read out without end.
    await input.fill('voice_scale 0.5');
    await input.press('Enter');
    await page.waitForFunction(() => document.getElementById('console-status').textContent.length > 0);
    const told = await page.evaluate(() => ({ live: document.getElementById('console-out').getAttribute('aria-live'), open: document.getElementById('console-details').open,
      status: document.getElementById('console-status').textContent, role: document.getElementById('console-status').getAttribute('role') }));
    check(told.open && told.live === 'off' && told.role === 'status' && told.status.includes('"voice_scale" = "0.5"') && !told.status.includes('] voice_scale'),
      'with the console open its output is aria-live off, and a typed command\'s answer goes to a hidden status', JSON.stringify(told));
    await input.fill('voice_scale 1');
    await input.press('Enter');

    // 6. The picture, the live bars, the advanced switch; 2. the note after a stop.
    await chooseFile(page, { name: 'access.wav', mimeType: 'audio/wav', buffer: wavSpeech(3) });
    const picture = await page.evaluate(() => {
      const ids = (document.getElementById('advanced-toggle').getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
      const controlled = ids.map((id) => document.getElementById(id));
      return { described: document.getElementById('visualizer').getAttribute('aria-describedby'), legend: document.getElementById('viz-legend').textContent.length,
        controls: ids, holdsSwitch: controlled.some((el) => !el || el.contains(document.getElementById('advanced-toggle'))),
        holdsGroups: controlled.some((el) => el && el.querySelectorAll('fieldset.chain-group').length === document.querySelectorAll('#controls-wrapper fieldset.chain-group').length) };
    });
    check(picture.described === 'viz-legend' && picture.legend > 0, 'the picture of the sound is described by the legend under it', `aria-describedby="${picture.described}"`);
    check(!picture.holdsSwitch && picture.holdsGroups, 'the advanced switch\'s aria-controls names the element that holds the advanced groups, not the switch', picture.controls.join(' '));
    await page.locator('#live-toggle').click();
    await page.waitForFunction(() => window.TF2Live && TF2Live.stats && TF2Live.stats.frames > 40, null, { timeout: 30000 });
    await page.waitForTimeout(700);
    const meters = await page.evaluate(() => [...document.querySelectorAll('#live-panel [role="meter"]')].map((m) => ({ name: m.getAttribute('aria-label'),
      now: m.getAttribute('aria-valuenow'), min: m.getAttribute('aria-valuemin'), max: m.getAttribute('aria-valuemax'), text: m.getAttribute('aria-valuetext') })));
    const noteRole = await page.locator('#live-note').getAttribute('role');
    check(meters.length === 2 && meters.every((m) => m.name && m.min === '-60' && m.max === '0' && Number.isFinite(Number(m.now)) && m.now !== null && /dBFS|silence/.test(m.text))
      && meters.some((m) => Number(m.now) > -60),
      'the live panel\'s two bars are meters with a name and a numeric value in dBFS while the fake microphone runs', JSON.stringify(meters));
    const recordName = await page.locator('#live-record').textContent();
    await page.locator('#live-toggle').click();
    await page.waitForFunction(() => !TF2Live.running);
    const stopped = await page.locator('#live-note').textContent();
    check(noteRole === 'status' && !stopped.startsWith('Live.') && stopped === 'Stopped.' && /Record this session/.test(recordName),
      'the live note is a status, reads "Stopped." after a stop (not "Live."), and the panel\'s button is "Record this session"', `${stopped}; ${recordName}`);

    // 4. The phone, every panel open, a render on screen.
    await page.locator('#advanced-toggle').evaluate((b) => { if (b.getAttribute('aria-expanded') !== 'true') b.click(); });
    await page.locator('#reference summary').click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 664 });
      await page.waitForTimeout(200);
      const phone = await page.evaluate(() => {
        const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const ctx = document.createElement('canvas').getContext('2d');
        const selects = [...document.querySelectorAll('select')].filter(shown).map((el) => {
          const s = getComputedStyle(el);
          ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
          const text = el.selectedOptions[0] ? el.selectedOptions[0].textContent : '';
          const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 20;
          return { id: el.id, wide: ctx.measureText(text).width > room, ellipsis: s.textOverflow === 'ellipsis' };
        });
        const box = document.querySelector('#meter .meter-scroll');
        box.focus();
        const live = ['live-ptt', 'live-lowlat', 'live-queue'].map((id) => { const el = document.getElementById(id), r = el.getBoundingClientRect(), l = el.closest('label').getBoundingClientRect();
          return { id, w: r.width, h: r.height, row: l.height }; });
        const tall = [...document.querySelectorAll('#controls-wrapper input[type=number], #controls-wrapper select, input[type=file]')].filter(shown)
          .map((el) => ({ id: el.id, h: el.getBoundingClientRect().height }));
        return { selects, region: { role: box.getAttribute('role'), label: box.getAttribute('aria-label'), focused: document.activeElement === box,
          scrolls: box.scrollWidth > box.clientWidth, sticky: getComputedStyle(box.querySelector('tbody th')).position },
          live, short: tall.filter((t) => t.h < 44 - 0.5), tall: tall.length, fits: document.documentElement.scrollWidth <= window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth };
      });
      check(phone.fits, `${width} px: the page does not scroll sideways`, `${phone.scrollWidth} px`);
      if (width === 320) continue;
      const cut = phone.selects.filter((s) => s.wide && !s.ellipsis);
      check(cut.length === 0 && phone.selects.length > 5, `${width} px: no select's chosen text is wider than its box unless it ends in an ellipsis`,
        `${phone.selects.length} selects, ${phone.selects.filter((s) => s.wide).length} too long for theirs${cut.length ? `; cut: ${cut.map((s) => s.id).join(', ')}` : ''}`);
      check(phone.region.role === 'region' && phone.region.label && phone.region.focused && phone.region.scrolls && phone.region.sticky === 'sticky',
        `${width} px: the loudness table's box is a named region that takes the focus, scrolls, and its first column stays`, JSON.stringify(phone.region));
      check(phone.live.every((c) => c.w >= 20 && c.h >= 20 && c.row >= 44), `${width} px: the live checkboxes are at least 20 px, in label rows at least 44 px high`, JSON.stringify(phone.live));
      check(phone.short.length === 0 && phone.tall > 20, `${width} px: every number box, select and file control of the settings is at least 44 px high`,
        phone.short.map((t) => `${t.id} ${t.h}`).join(', ') || `${phone.tall} controls`);
    }

    // 5. Sizes and contrast, at every width.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 720 });
      const sizes = await page.evaluate(() => {
        const px = (el) => parseFloat(getComputedStyle(el).fontSize);
        const small = (sel, min) => [...document.querySelectorAll(sel)].filter((el) => el.textContent.trim() && px(el) < min).map((el) => `${el.id || el.textContent.trim().slice(0, 20)} ${px(el)}`);
        return [...small('label, legend', 12), ...small('.cvar', 11), ...small('.viz-mode, .viz-select', 11)];
      });
      check(sizes.length === 0, `${width} px: labels and legends at least 12 px, the console names beside them and the view buttons at least 11 px`, sizes.join(', '));
    }
    await input.fill('net_g');
    const contrast = { footer: await contrastOf(page, 'footer'), footerLink: await contrastOf(page, 'footer a'), consoleHint: await contrastOf(page, '.summary-hint'),
      typedHint: await contrastOf(page, '#console-hint'), pushToTalk: await contrastOf(page, '#live-tx') };
    check(Object.values(contrast).every((c) => c >= 4.5), 'the footer, the console\'s hints and the live panel\'s idle "○ push-to-talk" reach 4.5 to 1',
      Object.entries(contrast).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
    check(errors.length === 0, 'keyboard, phone and screen reader checks have no page errors', errors.join('; '));
  } finally { await context.close(); }

  // 2. The microphone refused, and none: a browser of its own for each.
  for (const [label, args, permissions, what] of [
    ['no microphone permission', ['--use-fake-device-for-media-stream'], [], /^The browser did not let this page use the microphone\. Allow it for this site \(the icon in the address bar\), then press (Live|Record) again\.$/],
    ['no microphone', ['--use-fake-ui-for-media-stream'], ['microphone'], /^No microphone was found\. Plug one in, or choose it in the system's sound settings, then press (Live|Record) again\.$/]]) {
    const other = await launchBrowser(args);
    try {
      const page = await (await other.newContext({ serviceWorkers: 'block', permissions })).newPage();
      page.setDefaultTimeout(30000);
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('#live-toggle').click();
      await page.waitForFunction(() => document.getElementById('live-note').classList.contains('error'), null, { timeout: 15000 }).catch(() => {});
      const note = await page.evaluate(() => {
        const n = document.getElementById('live-note'), s = getComputedStyle(n);
        const ref = document.createElement('div'); ref.className = 'source-status error'; ref.textContent = 'x'; document.querySelector('.upload-row').appendChild(ref);
        const r = getComputedStyle(ref), want = { color: r.color, size: r.fontSize };
        ref.remove();
        return { text: n.textContent, role: n.getAttribute('role'), error: n.classList.contains('error'), color: s.color, size: s.fontSize, want };
      });
      check(note.role === 'status' && note.error && note.color === note.want.color && note.size === note.want.size && what.test(note.text) && /Live/.test(note.text),
        `${label}: after a press on Live the note, a status in the error style, says what to do about the microphone`, note.text);
      await page.locator('#mic').click();
      await page.waitForFunction(() => document.getElementById('source-status').classList.contains('error'), null, { timeout: 15000 }).catch(() => {});
      const status = await page.evaluate(() => ({ text: document.getElementById('source-status').textContent, error: document.getElementById('source-status').classList.contains('error'),
        role: document.getElementById('source-status').getAttribute('role') }));
      check(status.role === 'status' && status.error && what.test(status.text) && /Record/.test(status.text),
        `${label}: after a press on Record the status line says the same, with "Record"`, status.text);
    } finally { await other.close(); }
  }
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
    await chooseFile(page, { name: 'solo.wav', mimeType: 'audio/wav', buffer: wavTone(0.4) });
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
// sw.js: derived from the shipped files' own text (tests/lib/site-files.cjs:
// the page, what its markup links, the manifest's icons, and what the code
// loads at run time). tests/site.verify.mjs holds sw.js to the same list.
const SITE_FILES = siteFiles(path.join(__dirname, '..')).files;

// A first visit: the service worker installs and takes control while the
// page is open, and the page is not reloaded under it. Every file the page
// needs offline must then already be in the cache (the worker caches what a
// controlled page fetches, so a later check cannot tell the asset list is
// short). Then offline, a reload starts the app, and a file loads and renders.
async function verifyFirstVisitOffline(browser, base) {
  console.log('\n[Browser 4b] A first visit leaves everything needed offline in the cache');
  const root = path.join(__dirname, '..');
  const assets = [...fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)]
    .map(m => m[1].replace(/^\.\//, ''));
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  // Every request to the test server, from the page, its workers and the
  // service worker, from before the first visit to the end of the offline
  // render (blob: URLs made on the page are not requests to the server).
  const requested = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin === base) requested.push(decodeURIComponent(url.pathname.slice(1)) + url.search);
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const linked = await page.evaluate(() => [...document.querySelectorAll('script[src], link[href]')]
      .map(e => { const u = new URL(e.getAttribute('src') || e.getAttribute('href'), location.href); return u.pathname.slice(1) + u.search; }));
    const needed = ['', ...SITE_FILES];
    const unread = linked.filter(f => !needed.includes(f));
    check(needed.every(f => !f || fs.existsSync(path.join(root, f))) && assets.every(a => needed.includes(a)) && unread.length === 0,
      'the files the page needs exist, and sw.js lists nothing else', unread.length ? `tags the static reading missed: ${unread.join(', ')}` : `${needed.length} files`);
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
    await page.waitForFunction(() => /Rendered in|failed/i.test(document.getElementById('render-status').textContent) && !state.processing, null, { timeout: 60000 });
    const done = await page.evaluate(() => ({ status: document.getElementById('render-status').textContent, log: document.getElementById('console-out').textContent }));
    check(done.status.startsWith('Rendered in') && done.log.includes('libopus 1.1.5'), 'and renders by itself with the bundled codec', done.status);
    check(errors.length === 0, 'the first visit and the offline reload have no page errors', errors.join('; '));
    // sw.js is the service worker's own script: registered, and not in its own cache.
    const outside = [...new Set(requested.filter(f => !needed.includes(f) && f !== 'sw.js'))];
    check(requested.length > 0 && outside.length === 0, 'every request of the first visit and the offline render is for a file of the list',
      outside.length ? `outside the list: ${outside.join(', ')}` : `${requested.length} requests, ${new Set(requested).size} files`);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
}

// A returning visitor after an update, with every file sent max-age=600, as
// GitHub Pages sends index.html (measured on the live site on 2026-11-12;
// the other files inferred): the browser's HTTP cache may then use its copy
// of a file for ten minutes without asking, and the page's own memory cache
// may give a script or a module the copy an earlier load of the same tab
// had. The site is a copy of the page's files in a temporary folder. A first
// visit, then a second the worker controls, which also imports
// opus-codec.mjs. Each change k then: the file input's id renamed in
// index.html and app/core.js, so neither works with the other's old copy
// (app/source.js stops at load on a missing input); opus-codec.mjs exports
// __change = k; and audio-worker.js, which a navigation does not load but
// the install stores, ends with the line // change k. Change 1 and a
// navigation; change 2 and a reload, the same worker serving (the cache
// number is held until then, so a check of sw.js the browser makes by
// itself cannot start the newer worker first); the number then rises and
// the newer worker takes over; change 3 and a reload; a load made offline,
// change 4, and a navigation back online. The worker must ask the server
// past the browser's copies (cache: 'no-cache') and keep what it served,
// hand the page copies that its memory cache must ask about again
// (Cache-Control: no-cache), from the network and from its cache, and the
// newer worker's install must store the new files, not the browser's old
// copies (cache: 'reload').
async function verifyUpdateThroughHttpCache(browser) {
  console.log('\n[Browser 4c] An update reaches a returning visitor whole, past the browser\'s own copies (max-age=600)');
  const root = path.join(__dirname, '..');
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-update-'));
  for (const file of [...SITE_FILES, 'sw.js']) {
    fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(tree, file));
  }
  const number = Number(/CACHE_PREFIX\}v(\d+)/.exec(fs.readFileSync(path.join(tree, 'sw.js'), 'utf8'))[1]);
  const replace = (file, from, to) => {
    const text = fs.readFileSync(path.join(tree, file), 'utf8');
    if (text.split(from).length !== 2) throw new Error(`${file}: "${from}" is not there once`);
    fs.writeFileSync(path.join(tree, file), text.replace(from, to));
  };
  const worker = fs.readFileSync(path.join(tree, 'audio-worker.js'), 'utf8');
  const codec = fs.readFileSync(path.join(tree, 'opus-codec.mjs'), 'utf8');
  let id = 'file';
  const change = (k) => {
    replace('index.html', `id="${id}"`, `id="file-${k}"`);
    replace('app/core.js', `getElementById('${id}')`, `getElementById('file-${k}')`);
    fs.writeFileSync(path.join(tree, 'opus-codec.mjs'), `${codec}\nexport const __change = ${k};\n`);
    fs.writeFileSync(path.join(tree, 'audio-worker.js'), `${worker}\n// change ${k}\n`);
    id = `file-${k}`;
  };
  const server = await createStaticServer(tree, 0, { maxAge: 600 });
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const until = async (fn, arg, what) => {
      for (const end = Date.now() + 30000; !(await page.evaluate(fn, arg).catch(() => false));) {
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
        await page.waitForTimeout(100);
      }
    };
    // Which change each copy in a cache holds (0: the first visit's).
    const versions = (name) => page.evaluate(async (name) => {
      if (!(await caches.keys()).includes(name)) return null;
      const cache = await caches.open(name), out = {};
      for (const file of ['./', 'index.html', 'app/core.js', 'audio-worker.js']) {
        const hit = await cache.match(new URL(file, location.href).href);
        const text = hit ? await hit.text() : '';
        const m = file === 'audio-worker.js' ? /\/\/ change (\d+)\n$/.exec(text) : /getElementById\('file-(\d+)'\)|id="file-(\d+)"/.exec(text);
        out[file] = !hit ? 'missing' : m ? Number(m[1] || m[2]) : 0;
      }
      return out;
    }, name);
    const said = (v) => v ? Object.entries(v).map(([f, k]) => `${f} ${k}`).join(', ') : 'no such cache';
    // The page after change k: is the markup change k's, did app/core.js find
    // its input, and (withModule) is the imported opus-codec.mjs change k's?
    const pageAt = async (k, withModule = false) => {
      const seen = await page.evaluate(async ({ k, withModule }) => ({ page: document.getElementById(`file-${k}`) ? 'new' : 'old',
        script: typeof els === 'undefined' ? 'not run' : els.file ? (els.file.id === `file-${k}` ? 'new' : 'old') : 'finds no input',
        module: withModule ? await import('./opus-codec.mjs').then((m) => (m.__change === k ? 'new' : 'old'), (e) => `error ${e.message}`) : 'new' }), { k, withModule });
      return { ok: seen.page === 'new' && seen.script === 'new' && seen.module === 'new' && errors.length === 0,
        detail: `index.html ${seen.page}, app/core.js ${seen.script}${withModule ? `, opus-codec.mjs ${seen.module}` : ''}${errors.length ? `; ${errors.join('; ')}` : ''}` };
    };
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await until(() => !!navigator.serviceWorker.controller, null, 'the first visit\'s worker');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await until(() => !!navigator.serviceWorker.controller, null, 'a second visit the worker controls');
    await page.evaluate(() => import('./opus-codec.mjs'));
    // A navigation after change 1.
    change(1);
    errors.length = 0;
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const one = await pageAt(1, true);
    const kept = await versions(`tf2ve-v${number}`);
    check(one.ok, 'navigating to the page after an update gives the new index.html with the new app/core.js and the new opus-codec.mjs, and no page error', one.detail);
    check(!!kept && kept['./'] === 1 && kept['app/core.js'] === 1, 'the worker that served them keeps the new copies in its cache', said(kept));
    // A reload after change 2, the same worker serving.
    change(2);
    errors.length = 0;
    await page.reload({ waitUntil: 'networkidle' });
    const two = await pageAt(2, true);
    check(two.ok, 'a reload after a second update, the same worker serving, gives the new index.html with the new app/core.js and the new opus-codec.mjs, and no page error',
      two.detail);
    replace('sw.js', `\${CACHE_PREFIX}v${number}\``, `\${CACHE_PREFIX}v${number + 1}\``);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await until(async (name) => (await caches.keys()).join() === name && navigator.serviceWorker.controller.state === 'activated',
      `tf2ve-v${number + 1}`, 'the newer worker');
    const stored = await versions(`tf2ve-v${number + 1}`);
    check(!!stored && Object.values(stored).every((k) => k === 2),
      'once the newer worker has taken over, its cache holds the new index.html, app/core.js and audio-worker.js', said(stored));
    // A reload after change 3, the newer worker serving.
    change(3);
    errors.length = 0;
    await page.reload({ waitUntil: 'networkidle' });
    const three = await pageAt(3);
    check(three.ok, 'a reload after a third update, the newer worker serving, gives the new index.html with the new app/core.js, and no page error', three.detail);
    // A load made offline; change 4; back online, a navigation.
    await context.setOffline(true);
    errors.length = 0;
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const offline = await pageAt(3);
    change(4);
    await context.setOffline(false);
    errors.length = 0;
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const four = await pageAt(4);
    check(offline.ok && four.ok, 'after a load made offline, a fourth update and a navigation back online give the new index.html with the new app/core.js, and no page error',
      `offline: ${offline.detail}; online again: ${four.detail}`);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tree, { recursive: true, force: true });
  }
}

// W4-01b: the render's speed with the same samples. The page keeps one
// worker for its jobs and does not end it on Cancel; the result comes before
// the meter; the steam render's progress moves through its last stage.
// Each page counts the workers it makes and logs what they post, from an
// init script that stands in for Worker: it can also hold a worker's
// `meter` messages back, or drop the page's cancels (a worker that does not
// answer one).
async function speedPage(browser, base) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const Native = window.Worker;
    window.__workers = [];
    window.__posted = [];
    window.__held = [];
    window.__holdMeter = false;
    window.__dropCancel = false;
    window.__renders = [];
    window.Worker = class extends Native {
      constructor(url, options) {
        super(url, options);
        this.__index = window.__workers.length;
        window.__workers.push(String(url));
        // Registered before the page's onmessage, so it runs first and can stop it.
        this.addEventListener('message', (event) => {
          const data = event.data || {};
          window.__posted.push({ type: data.type, id: data.id, at: performance.now(), worker: this.__index });
          if (data.type === 'meter' && window.__holdMeter) {
            event.stopImmediatePropagation();
            window.__held.push({ worker: this, data });
          }
        });
      }
      postMessage(message, transfer) {
        if (message && message.type === 'source') window.__sources = (window.__sources || 0) + 1;
        if (message && message.type === 'process') window.__renders.push(message.id);
        if (window.__dropCancel && message && message.type === 'cancel') return;
        return transfer === undefined ? super.postMessage(message) : super.postMessage(message, transfer);
      }
    };
    // Each render's start and end on the page (runRender's tf2:busy events).
    window.__busy = [];
    document.addEventListener('tf2:busy', () => window.__busy.push([performance.now(), state.processing]));
    // Let the held `meter` messages through, in order.
    window.__release = () => {
      for (const { worker, data } of window.__held.splice(0)) worker.dispatchEvent(new MessageEvent('message', { data }));
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}
// The SHA-256 of a render of the source on screen with the controls'
// settings, made afresh on the page's own thread (TF2Audio.process, no
// worker and nothing kept), as hex.
const freshHash = (page) => page.evaluate(async () => {
  const demo = state.sourceDemo;
  // The options of the source on the page (W3-02d-1: a demo's voice and a
  // video keep the file's own timing), as runRender makes them.
  const opts = { ...sourceRenderOptions(demo), ...(demo ? { codec: demo.codecKey, received: demo.received } : {}) };
  const result = await TF2Audio.process(captureSource(state.decodedSource, opts.captureChannel), opts);
  const bytes = await result.blob.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
});
// The last render's time on the page, from its start to its end, in ms.
const lastRenderMs = (page) => page.evaluate(() => {
  const b = window.__busy, end = b.length - 1;
  let start = end - 1;
  while (start >= 0 && !b[start][1]) start--;
  return b[end][0] - b[start][0];
});
// The console's lines, and those since a line `mark` was logged.
const consoleLines = (page) => page.evaluate(() => [...document.getElementById('console-out').children].map((e) => e.textContent));
const linesSince = async (page, mark) => { const lines = await consoleLines(page); return lines.slice(lines.lastIndexOf(mark) + 1); };
const audioWorkers = (page) => page.evaluate(() => window.__workers.filter((url) => /audio-worker\.js$/.test(url)).length);

// Two renders of one source, the meter of each and of the original:
// one worker. The result is posted before the meter, and the table holds
// TF2Meter.analyze of the render, number for number.
async function speedOneWorker(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await chooseFile(page, { name: 'two.wav', mimeType: 'audio/wav', buffer: wavSpeech(10) });
    const r1 = await page.evaluate(() => state.renderId);
    await setControl(page, 'voice_scale', '0.5');
    await page.waitForFunction((r) => state.renderId === r + 1 && renderIdle(), r1, { timeout: 60000 });
    await page.waitForFunction(() => !!(state.meterStats && state.meterStats.wet && state.meterStats.dry), null, { timeout: 30000 });
    const made = await audioWorkers(page);
    check(made === 1, 'two renders of one source, their meters and the original\'s, construct one worker', `${made} constructed`);
    const order = await page.evaluate(() => {
      const result = window.__posted.filter((m) => m.type === 'result').at(-1);
      const of = (type) => window.__posted.findIndex((m) => m.type === type && m.id === result.id);
      return { result: of('result'), meter: of('meter'), done: of('done') };
    });
    check(order.result >= 0 && order.meter > order.result && order.done > order.meter,
      'the render\'s result is posted before its meter, and the worker is free after both', JSON.stringify(order));
    const same = await page.evaluate(() => {
      // Every number Object.is-equal, through the history's arrays.
      const equal = (a, b) => {
        if (a && typeof a === 'object') {
          if (!b || typeof b !== 'object') return false;
          const ka = Object.keys(a), kb = Object.keys(b);
          return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]));
        }
        return Object.is(a, b);
      };
      const fresh = TF2Meter.analyze(state.processedBuffer, state.processedRate), shown = state.meterStats.wet;
      const tr = [...document.querySelectorAll('#meter-rows tr')].find((r) => r.querySelector('th').textContent === 'RENDER');
      const texts = tr ? [...tr.querySelectorAll('td')].map((td) => td.textContent) : [];
      return { keys: Object.keys(fresh).length, equal: equal(fresh, shown),
        cells: texts.length === METER_COLUMNS.length && texts.every((t, i) => t === meterCell(METER_COLUMNS[i][0], fresh[METER_COLUMNS[i][0]])) };
    });
    check(same.equal && same.cells, 'the table\'s numbers are Object.is-equal to TF2Meter.analyze of the render, and its cells are those numbers',
      `${same.keys} members`);
    check(errors.length === 0, 'the kept worker: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// A late meter of a render no longer on screen does not fill the
// table: the first render's meter is held back until the second render
// and its meter are on screen.
async function speedLateMeter(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => { window.__holdMeter = true; });
    await chooseFile(page, { name: 'late.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) });
    await page.waitForFunction(() => window.__held.length === 1, null, { timeout: 30000 });
    const held = await page.evaluate(() => window.__held[0].data.id);
    await page.evaluate(() => { window.__holdMeter = false; });
    const r1 = await page.evaluate(() => state.renderId);
    await setControl(page, 'voice_scale', '0.6');
    await page.waitForFunction((r) => state.renderId === r + 1 && renderIdle(), r1, { timeout: 60000 });
    await page.waitForFunction(() => !!(state.meterStats && state.meterStats.wet), null, { timeout: 30000 });
    const row = () => page.evaluate(() => {
      const tr = [...document.querySelectorAll('#meter-rows tr')].find((r) => r.querySelector('th').textContent === 'RENDER');
      return tr ? tr.textContent : null;
    });
    const before = await row();
    await page.evaluate(() => window.__release());
    await page.waitForTimeout(300);
    const after = await row(), match = await page.evaluate(() => {
      const equal = (a, b) => (a && typeof a === 'object' ? !!b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every((k) => equal(a[k], b[k])) : Object.is(a, b));
      return equal(TF2Meter.analyze(state.processedBuffer, state.processedRate), state.meterStats.wet);
    });
    check(after === before && match, 'a meter that comes late for a render no longer on screen leaves the table to the render on screen',
      `held the meter of job ${held}`);
    check(errors.length === 0, 'the late meter: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Cancel stops the render and keeps the worker; a render after it gives a
// result. The render cancelled runs from the start (the mic gain changed),
// so that it is far from its end: the worker is free again under
// CANCEL_FREE_MS after the press (measured 51 to 90 ms on the build machine
// and 66 to 67 ms on CI's runner; a worker that lets no cancel in, its
// yields a resolved promise, was free only when its render ended, 414 ms
// after a press on a render from B and more on one from the start).
const CANCEL_FREE_MS = 300;
async function speedCancel(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await chooseFile(page, { name: 'cancel.wav', mimeType: 'audio/wav', buffer: wavSpeech(20) });
    await setControl(page, 'gain', '1.5');
    await page.waitForFunction(() => state.processing && Number((els.process.textContent.match(/(\d+)%/) || [])[1]) >= 25, null, { timeout: 30000 });
    const t0 = Date.now();
    await page.locator('#cancel-process').click();
    // The line under the player then marks the earlier render (W4-01a: the
    // controls hold settings not rendered); the console says it was cancelled.
    await page.waitForFunction(() => !state.processing && [...document.getElementById('console-out').children].some((e) => e.textContent === 'S_StopSound: render cancelled.'),
      null, { timeout: 30000 });
    await page.waitForFunction(() => !pageWorker.running, null, { timeout: 5000 });
    const stopped = Date.now() - t0;
    const r = await page.evaluate(() => state.renderId);
    await renderNow(page);
    check(stopped < CANCEL_FREE_MS && await page.evaluate((r) => state.renderId === r + 1, r) && await audioWorkers(page) === 1,
      `Cancel stops a render from the start within ${CANCEL_FREE_MS} ms and keeps the worker; a render after it gives a result`,
      `the worker free ${stopped} ms after Cancel; 1 worker`);

    // A setting changed while a render runs (a 40 s source, Packets lost %:
    // renders from A, about 1.4 s, longer than the 400 ms before the next one
    // starts): the running render is stopped for the newer settings, and the
    // render shown is a fresh render's, from the same worker.
    await chooseFile(page, { name: 'during.wav', mimeType: 'audio/wav', buffer: wavSpeech(40) }, 120000);
    const mark = 'test: loss changed during a render';
    await page.evaluate((m) => logLine(m, 'sys'), mark);
    await setControl(page, 'loss', '5');
    await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
    await setControl(page, 'loss', '10');
    await waitRendered(page, 120000);
    const stops = (await linesSince(page, mark)).filter((t) => t === 'S_StopSound: render stopped for newer settings.').length;
    const shown = await wavHash(page), again = await freshHash(page);
    check(stops === 1 && shown === again && await audioWorkers(page) === 1 && await page.evaluate(() => JSON.parse(state.renderedKey).lossPct === 10),
      'a 40 s source: Packets lost % changed while a render from A runs stops that render for the newer settings; the WAV shown is a fresh render\'s, from the same worker',
      `${stops} stopped; ${shown.slice(0, 12)} / ${again.slice(0, 12)}; ${await audioWorkers(page)} worker`);

    check(errors.length === 0, 'Cancel and the kept worker: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// A worker that does not answer a cancel is ended once the bound has passed
// (500 ms and 15 ms a second of source: 1.4 s for 60 s), no sooner and not
// more than a second later, and replaced; the source is sent to the new worker, and the render after it is
// right and made there (not on the page's own thread). The worker is made
// not to answer: the page's cancels are dropped, and every reply of the
// cancelled render but its progress and preview is held back (no result, no
// meter, no `done`), so it is busy at the bound however fast it renders. The
// check waits for the worker's end, not for the clock. [It used to count on
// the render being still busy 1.4 s after the press. On the build machine
// the press came 0.9 s after the button showed 5% and the render ended 1.6 to
// 2.3 s after the press; CI's runner once ended it within the bound, and the
// page kept the worker, as it should.]
async function speedCancelUnanswered(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => {
      window.__dropCancel = true;
      // The first render: its id, when its cancel was posted, when its worker was ended.
      const unanswered = window.__unanswered = { id: null, cancelAt: null, endedAt: null };
      const Counted = window.Worker;
      window.Worker = class extends Counted {
        constructor(url, options) {
          super(url, options);
          // Registered before the page's onmessage, so it runs first and can stop it.
          this.addEventListener('message', (event) => {
            const data = event.data || {};
            if (unanswered.id !== null && data.id === unanswered.id && data.type !== 'progress' && data.type !== 'preview') event.stopImmediatePropagation();
          });
        }
        postMessage(message, transfer) {
          if (message && message.type === 'process' && unanswered.id === null) { unanswered.id = message.id; this.__unanswered = true; }
          if (message && message.type === 'cancel' && message.id === unanswered.id) unanswered.cancelAt = performance.now();
          return super.postMessage(message, transfer);
        }
        terminate() {
          if (this.__unanswered && unanswered.endedAt === null) unanswered.endedAt = performance.now();
          return super.terminate();
        }
      };
    });
    await page.locator('#file').setInputFiles({ name: 'unanswered.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) });
    await page.waitForFunction(() => state.processing && Number((els.process.textContent.match(/(\d+)%/) || [])[1]) >= 5, null, { timeout: 30000 });
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => !state.processing, null, { timeout: 30000 });
    // The worker's end; a page that never ends it fails the check below.
    const ended = await page.waitForFunction(() => window.__unanswered.endedAt !== null, null, { timeout: 30000 }).then(() => true, () => false);
    // The render after it; a page that ends the worker but does not replace it fails the check below.
    const rendered = ended && await renderNow(page, 120000).then(() => true, () => false);
    const lines = await consoleLines(page);
    const replaced = lines.find((t) => /did not stop within \d+ ms of the cancel/.test(t));
    const compatible = lines.filter((t) => /compatibility path/.test(t)).length;
    const late = await wavHash(page);
    const unanswered = await page.evaluate(() => window.__unanswered);
    const after = ended && unanswered.cancelAt !== null ? unanswered.endedAt - unanswered.cancelAt : NaN;
    await page.evaluate(() => { window.__dropCancel = false; });
    const sources = await page.evaluate(() => window.__sources);
    // Ended no sooner than the bound (less 1 ms for the two clocks' resolution, the timer's and
    // performance.now's) and no later than the bound and 1,000 ms.
    check(rendered && /within 1400 ms/.test(replaced || '') && after >= 1400 - 1 && after <= 1400 + 1000 && await audioWorkers(page) === 2 && sources === 2 && compatible === 0 && late === await freshHash(page),
      'a worker that does not answer a cancel is ended after the bound (1.4 s for 60 s) and replaced; the source goes to the new worker, and the render there is a fresh render\'s WAV',
      `${await audioWorkers(page)} workers, ${sources} source messages, ${compatible} on the page's thread; ${Number.isFinite(after) ? `ended ${after.toFixed(0)} ms after the cancel` : 'not ended'}; ${rendered ? 'rendered after it' : 'no render after it'}; ${replaced}`);
    check(errors.length === 0, 'an unanswered cancel: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// W3-02d-2, ruling 18: a render that started by itself for a source over 60 s
// runs only where the kept stage is. On the rig of the check above (the
// worker made not to answer a cancel), a 61 s source: volume changed, and
// changed again while that render runs. The worker is ended at the cancel's
// bound (1.4 s), and the render queued for the second change finds the kept
// stage gone: it does not run from the start in the new worker, the render on
// screen is marked, and the console says so. Then the worker breaking
// (its onerror) during such a render: nothing renders on the page's thread.
async function speedKeptLost(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => {
      const rig = window.__rig = { armed: false, id: null, endedAt: null };
      const Counted = window.Worker;
      window.Worker = class extends Counted {
        constructor(url, options) {
          super(url, options);
          this.addEventListener('message', (event) => {
            const data = event.data || {};
            if (rig.id !== null && data.id === rig.id && data.type !== 'progress' && data.type !== 'preview') event.stopImmediatePropagation();
          });
        }
        postMessage(message, transfer) {
          if (message && message.type === 'process' && rig.armed && rig.id === null) { rig.id = message.id; this.__rigged = true; }
          if (message && message.type === 'cancel' && message.id === rig.id) return;
          return super.postMessage(message, transfer);
        }
        terminate() { if (this.__rigged && rig.endedAt === null) rig.endedAt = performance.now(); return super.terminate(); }
      };
    });
    await chooseFile(page, { name: 'kept-lost.wav', mimeType: 'audio/wav', buffer: wavSpeech(61) }, 120000);
    const mark = 'test: the kept stage lost before a render by itself';
    const r = await page.evaluate((m) => { logLine(m, 'sys'); window.__rig.armed = true; return state.renderId; }, mark);
    await setControl(page, 'volume', '0.5');
    await page.waitForFunction(() => window.__rig.id !== null && state.processing, null, { timeout: 30000 });
    await setControl(page, 'volume', '0.6');
    const ended = await page.waitForFunction(() => window.__rig.endedAt !== null, null, { timeout: 30000 }).then(() => true, () => false);
    await page.waitForFunction(() => renderIdle() && !pageWorker.running && !pageWorker.queue.length, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    const lines = await linesSince(page, mark);
    const after = await page.evaluate((r) => ({ renders: state.renderId - r, stale: state.stale, status: els.renderStatus.textContent, kept: state.workerKeepsShown,
      cancelled: state.cancelledKey === currentRenderKey() }), r);
    const fromStart = lines.filter((t) => /^ChangeLevel: rendered .* from the start$/.test(t)).length;
    const said = lines.filter((t) => t.startsWith('S_StopSound: the render by itself did not run')).length;
    check(ended && fromStart === 0 && lines.filter((t) => t.startsWith('ChangeLevel')).length === 0 && after.renders === 0 && after.stale && after.status === STALE_TEXT
      && !after.kept && !after.cancelled && said === 1 && lines.filter((t) => /compatibility path/.test(t)).length === 0,
      'a 61 s source, two volume changes, the worker ended at the cancel\'s bound: the render queued for the second change does not run from the start; the render on screen is marked, and the console says why',
      `${ended ? 'worker ended' : 'worker not ended'}; ${after.renders} renders shown; ${said} line; ${lines.filter((t) => /^(ChangeLevel|S_StopSound)/.test(t)).join(' | ')}`);
    // Render pressed: a render from the start, which keeps the stages again.
    await page.evaluate(() => { window.__rig.armed = false; });
    await renderNow(page, 120000);
    const pressed = await page.evaluate(() => ({ from: state.renderedFrom, kept: state.workerKeepsShown }));
    // The worker breaks (its onerror, raised by the test) during a render by itself.
    const mark2 = 'test: the worker breaks during a render by itself';
    const r2 = await page.evaluate((m) => { logLine(m, 'sys'); return state.renderId; }, mark2);
    await setControl(page, 'volume', '0.7');
    await page.waitForFunction(() => state.processing && pageWorker.running && pageWorker.running.render, null, { timeout: 30000 });
    await page.evaluate(() => pageWorker.worker.onerror(new ErrorEvent('error', { message: 'broken by the test' })));
    await page.waitForFunction(() => renderIdle(), null, { timeout: 120000 });
    await page.waitForTimeout(800);
    const lines2 = await linesSince(page, mark2);
    const broke = await page.evaluate((r) => ({ renders: state.renderId - r, stale: state.stale, kept: state.workerKeepsShown }), r2);
    check(pressed.from === null && pressed.kept && broke.renders === 0 && broke.stale && !broke.kept && lines2.filter((t) => /compatibility path/.test(t)).length === 0
      && lines2.filter((t) => t.startsWith('S_StopSound: the render by itself did not run')).length === 1,
      'the worker breaking during a render by itself of a 61 s source: nothing renders on the page\'s thread, and the render on screen is marked',
      `${broke.renders} renders shown; ${lines2.filter((t) => /^(ChangeLevel|S_StopSound|Audio worker)/.test(t)).join(' | ')}`);
    check(errors.length === 0, 'the kept stage lost: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Progress that moves: in a 60 s steam render the button shows at least
// five percentages from 60 to 72 (Steam's resampler, the gain, the laying).
async function speedProgress(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => {
      window.__percents = [];
      new MutationObserver(() => {
        const m = els.process.textContent.match(/(\d+)%/);
        if (m) window.__percents.push(Number(m[1]));
      }).observe(els.process, { childList: true, characterData: true, subtree: true });
    });
    await chooseFile(page, { name: 'sixty.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) }, 120000);
    const percents = await page.evaluate(() => [...new Set(window.__percents.filter((p) => p >= 60 && p <= 72))]);
    check(percents.length >= 5, 'a 60 s steam render shows at least five percentages from 60 to 72 on the button', percents.join(', '));
    check(errors.length === 0, 'progress: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Step 2, the stages before a changed setting. The option names the
// Node suite changes one by one are the page's.
async function speedStages(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    const text = fs.readFileSync(path.join(__dirname, 'stages.verify.mjs'), 'utf8');
    const listed = JSON.parse(/const RENDER_OPTION_NAMES = (\[[^\]]*\]);/.exec(text)[1].replace(/'/g, '"'));
    const sent = await page.evaluate(() => Object.keys(renderOptions()));
    check(listed.length === sent.length && [...listed].sort().join() === [...sent].sort().join(),
      'tests/stages.verify.mjs changes every option the page sends, and no other', `${listed.length} names`);
    // A 60 s source, then voice_scale 0.5: the render from B takes under
    // half the first's time and gives a fresh page's WAV. The source goes
    // to the worker once.
    await chooseFile(page, { name: 'reuse.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) }, 120000);
    const first = await lastRenderMs(page);
    await setControl(page, 'voice_scale', '0.5');
    await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
    await waitRendered(page, 120000);
    const second = await lastRenderMs(page), reused = await wavHash(page);
    await setControl(page, 'loss', '5');
    await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
    await waitRendered(page, 120000);
    const third = await lastRenderMs(page), lossy = await wavHash(page), lossyFresh = await freshHash(page);
    const sources = await page.evaluate(() => window.__sources);
    const fresh = await speedPage(browser, base);
    let freshHashValue = null;
    try {
      await setControl(fresh.page, 'voice_scale', '0.5');
      await chooseFile(fresh.page, { name: 'reuse.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) }, 120000);
      freshHashValue = await wavHash(fresh.page);
    } finally { await fresh.context.close(); }
    check(second < first / 2 && reused === freshHashValue,
      'a 60 s source, then voice_scale 0.5: the render takes under half the first\'s time and gives a fresh page\'s WAV',
      `${Math.round(first)} ms, then ${Math.round(second)} ms; ${reused.slice(0, 12)} / ${freshHashValue && freshHashValue.slice(0, 12)}`);
    check(lossy === lossyFresh && third < first && sources === 1,
      'then Packets lost % at 5: a fresh render\'s WAV, from A; the source went to the worker once for the three renders',
      `${Math.round(third)} ms; ${sources} source message`);
    check(errors.length === 0, 'the stages: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// A demo's voice: a new speaker is a new source for the worker (its
// samples sent again, nothing of the other speaker's taken), and each
// render is a fresh render's.
async function speedDemoSource(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.locator('#file').setInputFiles(path.join(__dirname, 'demo', 'synthetic.dem'));
    await waitRendered(page);
    const one = { sources: await page.evaluate(() => window.__sources), wav: await wavHash(page), fresh: await freshHash(page) };
    await page.locator('#demo-speaker').selectOption('4503603922337794');
    await page.waitForFunction(() => state.sourceDemo && state.sourceDemo.speaker.id === '4503603922337794');
    await waitRendered(page);
    const two = { sources: await page.evaluate(() => window.__sources), wav: await wavHash(page), fresh: await freshHash(page) };
    const r2 = await page.evaluate(() => state.renderId);
    await page.evaluate(() => execCommand('voice_scale 0.5'));
    await page.waitForFunction((r) => state.renderId > r && renderIdle(), r2, { timeout: 30000 });
    const three = { sources: await page.evaluate(() => window.__sources), wav: await wavHash(page), fresh: await freshHash(page) };
    check(one.sources === 1 && two.sources === 2 && three.sources === 2 && one.wav === one.fresh && two.wav === two.fresh
      && three.wav === three.fresh && one.wav !== two.wav,
      'a demo: another speaker sends the worker a new source, and each render (voice_scale changed too) is a fresh render\'s WAV',
      `${one.sources}, ${two.sources}, ${three.sources} source messages`);
    check(errors.length === 0, 'a demo\'s speakers: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Step 3: the first seconds. A 60 s source has a playable player within
// 2.5 s of its render's start, while the render runs: the first 14 s, said
// so under the player; the download, the views and the table wait. The
// whole render then takes the player's place at its position, playing on.
// None with Packets lost % at 5, and none for a source of 30 s.
async function speedFirstSeconds(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => {
      window.__previewSeen = null;
      document.addEventListener('canplay', (e) => {
        if (e.target === els.audio && state.preview && els.audio.getAttribute('src') === state.preview.url && !window.__previewSeen) {
          const b = window.__busy, start = b.filter((x) => x[1]).at(-1);
          window.__previewSeen = { after: performance.now() - start[0], processing: state.processing, percent: els.progress ? els.progress.value : null,
            status: els.renderStatus.textContent, download: els.dl.disabled, wet: !!state.processedBuffer,
            renderRow: [...document.querySelectorAll('#meter-rows th')].some((th) => th.textContent === 'RENDER'),
            duration: els.audio.duration };
        }
      }, true);
    });
    // A click first: the page has had a user's gesture, so it may play.
    await page.locator('#viz-wave').click();
    await page.locator('#file').setInputFiles({ name: 'first.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) });
    await page.waitForFunction(() => !!window.__previewSeen, null, { timeout: 30000 });
    const seen = await page.evaluate(() => window.__previewSeen);
    check(seen.after < 2500 && seen.processing && seen.percent < 100 && Math.abs(seen.duration - 14) < 0.01,
      'a 60 s source: the player can play the first 14 s within 2.5 s of the render\'s start, while it renders',
      `${Math.round(seen.after)} ms, at ${seen.percent}%; ${seen.duration.toFixed(3)} s`);
    check(seen.status === 'The first 14 s; the rest is rendering…' && seen.download && !seen.wet && !seen.renderRow,
      'the line under the player says so; the download, the views and the table show nothing new until the whole render', seen.status);
    await page.evaluate(async () => { els.audio.currentTime = 3; await els.audio.play(); });
    await page.waitForFunction(() => els.audio.currentTime > 3.2 && !els.audio.paused);
    await page.evaluate(() => {
      const proto = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      window.__place = null; window.__restored = null;
      Object.defineProperty(els.audio, 'src', { configurable: true, get() { return proto.get.call(this); },
        set(v) { if (v === state.lastBlob) { window.__place = { at: this.currentTime, playing: !this.paused };
          this.addEventListener('seeked', () => { window.__restored = this.currentTime; }, { once: true }); } proto.set.call(this, v); } });
    });
    await page.waitForFunction(() => state.renderId === 1 && renderIdle() && window.__restored !== null, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ place: window.__place, restored: window.__restored, playing: !els.audio.paused, now: els.audio.currentTime,
      duration: els.audio.duration, preview: state.preview, download: els.dl.disabled }));
    await page.evaluate(() => { delete els.audio.src; els.audio.pause(); });
    check(after.place && after.place.playing && Math.abs(after.restored - after.place.at) < 0.15 && after.playing && after.now > after.restored
      && Math.abs(after.duration - 60) < 0.01 && after.preview === null && !after.download,
      'the whole render then takes the player\'s place where the first seconds had got to, and plays on',
      `at ${after.place && after.place.at.toFixed(3)} s, on from ${after.restored && after.restored.toFixed(3)} s; ${after.duration.toFixed(1)} s long`);
    const posted = await page.evaluate(() => window.__posted.filter((m) => m.type === 'preview').length);
    // Packets lost % at 5: no first seconds.
    await page.evaluate(() => { window.__previewSeen = null; window.__posted.length = 0; });
    await setControl(page, 'loss', '5');
    await page.waitForFunction(() => state.processing, null, { timeout: 30000 });
    await waitRendered(page, 120000);
    const lossy = await page.evaluate(() => ({ previews: window.__posted.filter((m) => m.type === 'preview').length, seen: window.__previewSeen }));
    check(posted === 1 && lossy.previews === 0 && lossy.seen === null, 'with Packets lost % at 5 there are no first seconds', `${lossy.previews} posted`);
    // A source of 30 s: none.
    await page.evaluate(() => { window.__posted.length = 0; });
    await setControl(page, 'loss', '0');
    await chooseFile(page, { name: 'thirty.wav', mimeType: 'audio/wav', buffer: wavSpeech(30) }, 120000);
    check(await page.evaluate(() => window.__posted.filter((m) => m.type === 'preview').length) === 0, 'a source of 30 s gets no first seconds');
    check(errors.length === 0, 'the first seconds: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Cancel while the first seconds play: the player gives back what it
// held (nothing, for a first render), and the line says the render was
// cancelled.
async function speedFirstSecondsCancel(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.locator('#file').setInputFiles({ name: 'stop.wav', mimeType: 'audio/wav', buffer: wavSpeech(90) });
    await page.waitForFunction(() => !!state.preview && state.processing, null, { timeout: 30000 });
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => !state.processing, null, { timeout: 30000 });
    const left = await page.evaluate(() => ({ src: els.audio.getAttribute('src'), preview: state.preview, status: els.renderStatus.textContent, workers: window.__workers.length,
      audio: window.__workers.filter((url) => /audio-worker\.js$/.test(url)).length }));
    check(!left.src && left.preview === null && /cancelled/.test(left.status) && left.workers === 1 && left.audio === 1,
      'Cancel during the first seconds empties the player of them; the line says the render was cancelled; the worker is kept', left.status);
    check(errors.length === 0, 'Cancel during the first seconds: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// A render asked for while the page's worker makes a download (an MP3 of a
// 60 s render) waits behind it; cancelled while it waits, it never reaches
// the worker.
async function speedQueuedCancel(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await chooseFile(page, { name: 'queued.wav', mimeType: 'audio/wav', buffer: wavSpeech(60) }, 120000);
    const before = await page.evaluate(() => window.__renders.length);
    await page.evaluate(() => { window.__export = exportWav(state.lastWav, 'mp3'); });
    await page.waitForFunction(() => pageWorker.running && pageWorker.running.message.type === 'export', null, { timeout: 30000 });
    await page.locator('#process').click();
    await page.waitForFunction(() => state.processing && pageWorker.queue.some((job) => job.render), null, { timeout: 30000 });
    const waited = await page.evaluate(() => pageWorker.running && pageWorker.running.message.type === 'export');
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => !state.processing, null, { timeout: 30000 });
    await page.evaluate(() => window.__export);
    await page.waitForFunction(() => !pageWorker.running, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ renders: window.__renders.length, queued: pageWorker.queue.filter((job) => job.render).length }));
    check(waited && after.renders === before && after.queued === 0,
      'a render asked for while the page\'s worker makes a download waits; cancelled while it waits, it never reaches the worker',
      `${after.renders - before} renders posted after the download`);
    check(errors.length === 0, 'a render cancelled while it waits: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// A stereo file: the capture channel switched renders the channel chosen,
// a fresh render's WAV; the worker is sent that channel as a source of its
// own.
async function speedCaptureChannel(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await chooseFile(page, { name: 'stereo.wav', mimeType: 'audio/wav', buffer: wavStereo(8) });
    const left = { wav: await wavHash(page), fresh: await freshHash(page) };
    const r = await page.evaluate(() => state.renderId);
    await setControl(page, 'capture_channel', 'right');
    await page.waitForFunction((r) => state.renderId > r && renderIdle(), r, { timeout: 60000 });
    const right = { wav: await wavHash(page), fresh: await freshHash(page), sources: await page.evaluate(() => window.__sources) };
    check(left.wav === left.fresh && right.wav === right.fresh && right.wav !== left.wav && right.sources === 2,
      'a stereo file: the capture channel switched renders the other channel (a fresh render\'s WAV), sent to the worker as a source of its own',
      `${left.wav.slice(0, 12)} then ${right.wav.slice(0, 12)}; ${right.sources} source messages`);
    check(errors.length === 0, 'the capture channel: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Cancel during the first seconds of a re-render: the player holds the
// earlier render again, at the place playback had got to, and plays on.
async function speedFirstSecondsRerenderCancel(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.locator('#viz-wave').click();
    await chooseFile(page, { name: 'again.wav', mimeType: 'audio/wav', buffer: wavSpeech(40) }, 120000);
    const earlier = await page.evaluate(() => state.lastBlob);
    await page.evaluate(async () => {
      const a = els.audio;
      if (!(a.duration > 0)) await new Promise((r) => a.addEventListener('loadedmetadata', r, { once: true }));
      a.currentTime = 4;
      await a.play();
    });
    await page.waitForFunction(() => els.audio.currentTime > 4.2 && !els.audio.paused);
    // The gate off: a render from A, with first seconds.
    await setControl(page, 'vad', '0');
    await page.waitForFunction(() => !!state.preview && els.audio.getAttribute('src') === state.preview.url, null, { timeout: 30000 });
    await page.waitForFunction(() => !els.audio.paused && els.audio.currentTime > 4.3, null, { timeout: 10000 });
    const during = await page.evaluate(() => els.audio.currentTime);
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => !state.processing && els.audio.getAttribute('src') === state.lastBlob, null, { timeout: 30000 });
    await page.waitForFunction((t) => !els.audio.paused && els.audio.currentTime > t, during, { timeout: 10000 }).catch(() => {});
    const after = await page.evaluate(() => ({ src: els.audio.getAttribute('src'), last: state.lastBlob, t: els.audio.currentTime, playing: !els.audio.paused,
      preview: state.preview, download: els.dl.disabled, status: els.renderStatus.textContent }));
    await page.evaluate(() => els.audio.pause());
    const cancelled = (await consoleLines(page)).includes('S_StopSound: render cancelled.');
    check(after.src === earlier && after.last === earlier && after.playing && after.t > during && after.preview === null && !after.download
      && cancelled && after.status === STALE_TEXT,
      'Cancel during the first seconds of a re-render gives the player back the earlier render, at its place, playing; its download is offered again, and the line marks it as made with the earlier settings',
      `from ${during.toFixed(3)} s on at ${after.t.toFixed(3)} s`);
    check(errors.length === 0, 'Cancel during a re-render\'s first seconds: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// The batch keeps its own lanes for its files too: a ZIP of FLAC asked for
// while the page renders a long source is made in workers of its own, ends
// before the render, and the page's worker makes none of it.
async function speedBatchExport(browser, base) {
  const { context, page, errors } = await speedPage(browser, base);
  try {
    await page.evaluate(() => { els.format.value = 'flac'; els.format.dispatchEvent(new Event('change')); });
    await page.locator('#batch-files').setInputFiles([
      { name: 'a.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) }, { name: 'b.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) }]);
    await page.locator('#batch-run').click();
    await page.waitForFunction(() => !state.batchRunning && !document.getElementById('batch-zip').disabled, null, { timeout: 60000 });
    await page.locator('#file').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: wavSpeech(90) });
    await page.waitForFunction(() => state.processing && Number((els.process.textContent.match(/(\d+)%/) || [])[1]) >= 5, null, { timeout: 60000 });
    const timing = await page.evaluate(async () => {
      const t0 = performance.now(), log = document.getElementById('console-out');
      const zipped = () => [...log.children].some((e) => /^Host_WriteFile: tf2_voice_.*\.zip/.test(e.textContent));
      let zip = null, render = null;
      document.getElementById('batch-zip').click();
      await new Promise((resolve) => {
        const tick = setInterval(() => {
          if (zip === null && zipped()) zip = performance.now() - t0;
          if (render === null && !state.processing) render = performance.now() - t0;
          if (zip !== null && render !== null) { clearInterval(tick); resolve(); }
        }, 10);
      });
      return { zip: Math.round(zip), render: Math.round(render), kept: pageWorker.worker ? pageWorker.worker.__index : null };
    });
    const exported = await page.evaluate((kept) => ({ byKept: window.__posted.filter((m) => m.type === 'exported' && m.worker === kept).length,
      byOthers: window.__posted.filter((m) => m.type === 'exported' && m.worker !== kept).length }), timing.kept);
    check(timing.zip < timing.render && exported.byKept === 0 && exported.byOthers === 2,
      'the batch\'s ZIP asked for while the page renders a long source is made in workers of its own and ends before the render',
      `ZIP at ${timing.zip} ms, the render's end at ${timing.render} ms; ${exported.byOthers} files exported by other workers, ${exported.byKept} by the page's`);
    check(errors.length === 0, 'the batch\'s files: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

async function verifySpeed(browser, base) {
  console.log('\n[Browser 10] Speed with the same samples (W4-01b): the kept worker, Cancel, the meter after the result, progress, the stages, the first seconds');
  for (const part of [speedOneWorker, speedLateMeter, speedCancel, speedCancelUnanswered, speedKeptLost, speedQueuedCancel, speedCaptureChannel, speedProgress, speedStages,
    speedDemoSource, speedFirstSeconds, speedFirstSecondsCancel, speedFirstSecondsRerenderCancel, speedBatchExport]) await part(browser, base);
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
      'capture_channel', 'vad', 'vad_threshold', 'steam_uptime', 'jitter',
      'underwater', 'a_sky', 'a_w', 'a_l', 'a_h', 'a_open', 'a_refl', 'live-lowlat', 'live-queue', 'fps', 'buffer_ms', 'timeline'];
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
    // A built-in preset leaves the listener's device alone (W3-10), and the
    // capture channel: both are properties of a PC (W4-01a).
    check(await page.locator('#device_rate').inputValue() === '44100' && await page.locator('#capture_channel').inputValue() === 'mix',
      'a built-in preset keeps the listener\'s sound device and the capture channel');
    await page.locator('#device_rate').selectOption('48000');
    await page.locator('#capture_channel').selectOption('left');
    check(await page.locator('#vad').inputValue() === 'auto' && await page.locator('#vad_threshold').inputValue() === '-40',
      'preset restores the measured voice gate (Steam\'s own, -40)');
    await page.locator('#console-details summary').click();
    await page.locator('#console-input').fill('echo <img src=x onerror="window.__consoleXss=1">');
    await page.locator('#console-input').press('Enter');
    check(await page.locator('#console-out img').count() === 0, 'console treats entered HTML as text');
    check(await page.evaluate(() => !window.__consoleXss), 'console input cannot execute markup');
    // S3-03: the mock server's player names and chat lines are pinned, so that a
    // change to either is a decision someone made. No check can judge a name; the
    // hash is of JSON.stringify([TF2_DATA.playerNames, TF2_DATA.chat]) as UTF-8.
    const mockListsHash = await page.evaluate(async () => {
      const bytes = new TextEncoder().encode(JSON.stringify([TF2_DATA.playerNames, TF2_DATA.chat]));
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    });
    check(mockListsHash === 'e6d5eaf66ce0d6034aaaa09e19f73df37e4e37fcdd164cf4d9c569aa19797ba8',
      'the mock console\'s player names and chat lines are the lists recorded in S3-03', mockListsHash);

    console.log('\n[Browser 3] Worker render and cancellation');
    // On the file's own timing (W3-02d-1), as in [Browser 5]: on the game's
    // voice queue a tone that opens the channel has short pieces cut out of its
    // first seconds, which the count of zero crossings below reads as a change
    // of pitch; the pitch does not move ([Browser 8c]). The Laggy and Modern
    // presets in 3b set the game's queue again.
    await page.evaluate(() => execCommand('voice_timeline source'));
    // The chosen file renders by itself (W4-01a).
    await chooseFile(page, { name: 'tone.wav', mimeType: 'audio/wav', buffer: wavTone(0.5) });
    const decodedSource = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
    check((await page.locator('#preview').getAttribute('src') || '').startsWith('blob:'), 'worker render creates playable output');
    check((await renderStatus(page)).startsWith('Rendered in'), 'completed render reports itself under the player', await renderStatus(page));
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
    check(await page.locator('.preset-row .preset-btn[aria-pressed="true"]').count() === 0, 'with a hand-edited control matching no preset, none is lit');
    await page.getByRole('button', { name: 'Laggy 18% Loss', exact: true }).click();
    check(await page.locator('.preset-btn[data-preset="laggy"]').getAttribute('aria-pressed') === 'true'
      && (await page.locator('#signal-chain').textContent()).includes('18% lost · 50 ms jitter')
      && await page.locator('#jitter').inputValue() === '50', 'preset highlights itself and updates the chain, including jitter');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    check(await page.locator('#jitter').inputValue() === '0', 'presets reset jitter');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    // The render on screen follows the settings (W4-01a); net_graph reads it.
    await waitRendered(page);
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
    await verifyMilesPage(page);
    await verifyCeltPage(page);
    await verifyRoomsPage(page);
    await verifySettingsWords(page);

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
        && /Listener's sound device/.test(fresh.label) && !/snd_device_rate/.test(fresh.label) && fresh.title.length > 40
        && /not a TF2 variable/.test(fresh.help) && fresh.link === 'device_rate' && (await chainOutput()).includes('48 kHz device'),
        // W3-17d: a setting of the listener's PC shows no variable's name; snd_device_rate stays the console's.
        'the choice "Listener\'s sound device: 48000 Hz (usual) / 44100 Hz" is on the page (its console name snd_device_rate, the app\'s own, not a TF2 variable, is not on its label), sent as deviceRate, shown in the chain strip',
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
        // The owner's sentence (W4-01, "The owner's answers"), in place of W3-10's.
        && vol.note === 'The game\'s volume setting; it sets the loudest the file can get. 1.0 is the game\'s default. The recordings behind the model were made at 0.15.',
        'volume defaults to 1, the game\'s default, with the sentence beside it', vol.note);
      // A render's download is at the chosen rate.
      await page.locator('#device_rate').selectOption('44100');
      const src = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
      await renderNow(page);
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
      const page = typeof TF2SteamSender === 'object' && typeof TF2Swresample === 'object' && typeof TF2Swresample.createResampler === 'function'
        && typeof TF2VoiceChannel === 'object' && typeof TF2VoiceChannel.createTimeline === 'function';
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
      && typeof self.TF2Swresample === 'object' && typeof self.TF2Swresample.createResampler === 'function'
      && typeof self.TF2VoiceChannel === 'object' && typeof self.TF2VoiceChannel.createTimeline === 'function') : 'no worker seen').catch((e) => `error ${e.message}`);
    await page.evaluate(() => { window.__liveWorker.terminate(); delete window.__liveWorker; });
    check(loaded.page && ['ready', 'stats'].includes(loaded.live) && scope === true,
      'the page and the live monitor\'s worker load steam-sender.js, voice-channel.js and vendor/swresample/swresample.js', `${loaded.live}; in the worker's scope: ${scope}`);
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
      check(labels.option === 'Fullband Opus: not in the game' && /not the game's path/.test(labels.name), 'steam_48 is named as not in the game, on the page and in its profile', labels.option);
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
    await verifyLiveRoom(page);
    await verifyVideo(page);
    await verifyDemo(page);
    await verifySourceDuringRender(page);

    // Cancel the render a chosen file starts by itself.
    await page.locator('#file').setInputFiles({ name: 'long-tone.wav', mimeType: 'audio/wav', buffer: wavTone(20) });
    await page.locator('#cancel-process').waitFor({ state: 'visible' });
    await page.evaluate(() => logLine('test: cancelled here', 'sys'));
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => document.getElementById('render-status').textContent.includes('cancelled'));
    check(!(await page.locator('#process').isDisabled()) && await page.locator('#process').textContent() === 'Render',
      'cancel restores the render controls', await renderStatus(page));
    // A cancelled render does not start again by itself (W4-01a).
    await page.waitForTimeout(1000);
    check(!(await page.evaluate(() => state.processing)) && await rendersStartedSince(page, 'test: cancelled here') === 0,
      'and the cancelled render does not start again by itself', `${await rendersStartedSince(page, 'test: cancelled here')} started`);

    await page.locator('#mic').click();
    await page.waitForFunction(() => document.getElementById('source-status').textContent.includes('Recording uncompressed'));
    // A render a changed setting starts during the recording (the source on
    // the page is 20 s long) leaves the recording's stop usable (W4-01a).
    await page.evaluate(() => execCommand('voice_scale 0.9'));
    await page.waitForFunction(() => state.processing, null, { timeout: 5000 });
    const stopUsable = await page.evaluate(() => !!state.recorder && !els.mic.disabled);
    await page.waitForTimeout(700); // Accumulate a meaningful fake-microphone recording.
    await page.locator('#mic').click({ timeout: 2000 });
    await page.evaluate(() => execCommand('voice_scale 1'));
    check(stopUsable, 'a render that a changed setting starts during a microphone recording leaves its stop usable');
    // The recording becomes the source, and renders by itself (W4-01a).
    await page.waitForFunction(() => state.sourceName === 'microphone');
    await waitRendered(page);
    check((await page.locator('#source-status').textContent()).includes('microphone'), 'uncompressed microphone recording loads successfully');
    const recording = await page.evaluate(() => {
      const pcm = state.decodedSource.getChannelData(0);
      return { duration: state.decodedSource.duration, power: pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length };
    });
    check(recording.duration > .5 && recording.duration < 3 && recording.power > 1e-8,
      'PCM microphone capture contains the synthetic input at the expected duration');
    await waitRendered(page);
    check((await renderStatus(page)).startsWith('Rendered in') && (await page.locator('#console-out').textContent()).includes('libopus 1.1.5'),
      'a microphone recording renders by itself, through real Opus', await renderStatus(page));

    console.log('\n[Browser 4] Responsive and offline behavior');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      presetHeights: Array.from(document.querySelectorAll('.preset-row .preset-btn')).map((el) => el.getBoundingClientRect().height)
    }));
    check(mobile.fits, 'mobile layout has no horizontal overflow');
    check(mobile.presetHeights.every((height) => height >= 44), 'mobile preset targets are at least 44px');

    // The defaults again, not the settings the checks above left remembered.
    await page.evaluate(() => localStorage.removeItem('tf2ve_settings'));
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
    check(afterUpdate.processEnabled, 'worker replacement leaves Render enabled');
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
    check(await page.evaluate(async ({ name, needed }) => {
      const cache = await caches.open(name);
      return (await Promise.all(needed.map(path => cache.match(new URL(path, location.href).href)))).every(Boolean);
    }, { name: SHELL_CACHE, needed: SITE_FILES }), 'batch, format, meter, reference, video, file-rate, demo, live-monitor, CELT, Speex, VR12 and MP3 encoder files are cached for offline use');
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
    await waitRendered(page);
    check((await page.locator('#console-out').textContent()).includes('libopus 1.1.5'), 'bundled real codec converts audio offline');
    // The speex profile's codec comes from the cache too.
    await page.locator('#codec').selectOption('speex');
    await page.locator('#process').click();
    await page.waitForFunction(() => document.getElementById('console-out').textContent.includes('S_Voice: Speex 1.0.2'));
    check((await page.locator('#console-out').textContent()).includes('S_Voice: Speex 1.0.2, 11.025 kbps CBR, 20-byte packets of 14.5 ms'),
      'the speex profile converts audio offline with Speex 1.0.2 in 20-byte packets');
    // And the miles profile's (W3-20b).
    await page.locator('#codec').selectOption('miles');
    await page.locator('#process').click();
    await page.waitForFunction(() => document.getElementById('console-out').textContent.includes('S_Voice: Voxware VR12'));
    check((await page.locator('#console-out').textContent()).includes('S_Voice: Voxware VR12 (voxware-vr12 eedf465), 2.94 kbps CBR, 12-byte packets of 32.7 ms'),
      'the miles profile converts audio offline with Voxware VR12 in 12-byte packets');
    await context.setOffline(false);
    check(pageErrors.length === 0, 'complete conversion and recording flow has no page errors', pageErrors.join('; '));

    await verifyFirstVisitOffline(browser, base);
    await verifyUpdateThroughHttpCache(browser);
    await verifyJourney(browser, base);
    await verifyPageTimeline(browser, base);
    await verifyJitterPage(browser, base);
    await verifyLaneAndTake(browser, base);
    await verifyAutoRerender(browser, base);
    await verifyVersionLine(browser);
    await verifyAccess(browser, base);
    await verifyBatchAndFormats(browser, base);
    await verifySampleRateMatrix(browser, base);
    await verifyNativeRate(browser, base);
    await verifySpeed(browser, base);

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
