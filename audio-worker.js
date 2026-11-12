/* Dedicated worker wrapper for the pure TF2Audio DSP core, for turning a
 * rendered WAV into the chosen download format, for metering, and for
 * lining up and comparing a real take.
 *
 * The page keeps one of these between jobs (W4-01b, app/render.js) and
 * gives it one job at a time; the batch makes its own. Each job ends with
 * a `done` message: the worker is then free for the next. A render can be
 * stopped by { type: 'cancel', id }: the render's next yield ends it with
 * an AbortError, and the worker goes on to the next job. The page sends its
 * source once ({ type: 'source', sourceId, sampleRate, samples }); its
 * renders name it, and the worker keeps their stages for the next. */
'use strict';

importScripts('constants.js', 'steam-sender.js', 'voice-channel.js', 'vendor/swresample/swresample.js', 'room-presets.js',
  'room-dsp.js', 'engine/dsp.js', 'engine/gain.js', 'engine/mix.js', 'engine/network.js', 'engine/codec.js',
  'engine/room.js', 'engine/steam.js', 'engine/render.js', 'engine/render-stream.js', 'engine/live-chain.js',
  'audio.js', 'flac.js', 'formats.js', 'zip.js', 'meter.js', 'reference.js');

// The job running now: { id, controller } (its AbortController).
let running = null;

const monoSource = (mono, sampleRate) => ({
  sampleRate,
  duration: mono.length / sampleRate,
  length: mono.length,
  numberOfChannels: 1,
  getChannelData: () => mono
});

// The page's source (W4-01b): its samples, sent once with an id in a
// `source` message, and the stages its renders keep (TF2Audio.process,
// opts.stages, with the id as opts.sourceKey). A new source replaces the
// old one and its stages.
let held = null;
function holdSource(message) {
  held = { id: message.sourceId, source: monoSource(new Float32Array(message.samples), message.sampleRate), stages: {} };
}

// A render: of the samples in the message (the batch's, as before W4-01b),
// or of the source the worker holds, by its id, with its stages.
async function processMessage(message, signal) {
  const id = message.id;
  let source, keep = {};
  if (message.sourceId !== undefined) {
    if (!held || held.id !== message.sourceId) throw new Error('The audio worker does not hold that source.');
    source = held.source;
    keep = { stages: held.stages, sourceKey: held.id };
  } else source = monoSource(new Float32Array(message.samples), message.sampleRate);
  const opts = {
    ...(message.opts || {}),
    ...keep,
    signal,
    onProgress: (value) => self.postMessage({ type: 'progress', id, value })
  };
  // The first seconds (W4-01b, step 3), when the page asks for them
  // ({ seconds, keep }) and the settings allow them (TF2Audio.previewAllowed):
  // a render of the source's first `seconds`, of which the first `keep` are
  // the whole render's, sample for sample, posted before the whole render
  // starts. Two renders, each from the start: the first seconds keep no
  // stages. None when the stages hold B for these settings: the whole
  // render is then a third of the time.
  if (message.preview && TF2Audio.previewAllowed(message.opts || {}) && TF2Audio.stagesHold(source, opts) !== 'b') {
    const n = Math.min(source.length, Math.round(message.preview.seconds * source.sampleRate));
    const first = await TF2Audio.process(monoSource(source.getChannelData(0).subarray(0, n), source.sampleRate), { ...(message.opts || {}), signal });
    const samples = first.samples.slice(0, Math.round(message.preview.keep * first.sampleRate));
    const blob = TF2Audio.encodeWav(samples, first.sampleRate);
    self.postMessage({ type: 'preview', id, samples: samples.buffer, sampleRate: first.sampleRate, blob, seconds: message.preview.keep }, [samples.buffer]);
  }
  const result = await TF2Audio.process(source, opts);
  // Loudness and levels of the render (meter.js): with `measure` in the
  // result (the batch), with `meterAfter` in a `meter` message of their own
  // once the result has been sent (the page, W4-01b: the result is heard
  // that much sooner). The meter runs on a copy, as the result's samples
  // go to the page.
  const stats = message.measure ? TF2Meter.analyze(result.samples, result.sampleRate) : null;
  const later = message.meterAfter ? result.samples.slice() : null;
  self.postMessage({
    type: 'result', id,
    samples: result.samples.buffer,
    sampleRate: result.sampleRate,
    blob: result.blob,
    realOpus: result.realOpus,
    codecInfo: result.codecInfo,
    stats
  }, [result.samples.buffer]);
  if (later) self.postMessage({ type: 'meter', id, stats: TF2Meter.analyze(later, result.sampleRate) });
}

// WAV bytes in, the file in `message.format` out, with its CRC-32 for ZIPs.
async function exportMessage(message) {
  let bytes = await TF2Formats.fromWav(new Uint8Array(message.wav), message.format);
  if (bytes.byteOffset || bytes.byteLength !== bytes.buffer.byteLength) bytes = bytes.slice();
  self.postMessage({ type: 'exported', id: message.id, bytes: bytes.buffer, crc: TF2Zip.crc32(bytes) }, [bytes.buffer]);
}

// Loudness and levels (meter.js) of the samples in `message.samples`.
async function analyzeMessage(message) {
  const stats = TF2Meter.analyze(new Float32Array(message.samples), message.sampleRate);
  self.postMessage({ type: 'analyzed', id: message.id, stats });
}

// A real take of the source: where the source is in it, talk spurt by talk
// spurt, and the take on the source's timeline at the take's rate
// (reference.js).
async function locateMessage(message) {
  const take = new Float32Array(message.take), source = new Float32Array(message.source);
  const timeline = TF2Reference.track(take, message.takeRate, source, message.sourceRate, message.options || {},
    (value) => self.postMessage({ type: 'progress', id: message.id, value }));
  const aligned = TF2Reference.warpSegments(take, message.takeRate, timeline.segments, message.takeRate, message.length);
  self.postMessage({ type: 'located', id: message.id, timeline, aligned: aligned.buffer }, [aligned.buffer]);
}

// The render against the aligned take.
async function compareTakeMessage(message) {
  const report = TF2Reference.compareTake(new Float32Array(message.real), new Float32Array(message.sim), message.rate);
  self.postMessage({ type: 'compared', id: message.id, report });
}

const HANDLERS = { process: processMessage, export: exportMessage, analyze: analyzeMessage, locate: locateMessage, compareTake: compareTakeMessage };

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type === 'cancel') {
    if (running && running.id === message.id) running.controller.abort();
    return;
  }
  if (message.type === 'source') { holdSource(message); return; }
  const handler = HANDLERS[message.type];
  if (!handler) return;
  const job = running = { id: message.id, controller: new AbortController() };
  try {
    await handler(message, job.controller.signal);
  } catch (error) {
    self.postMessage({
      type: 'error', id: message.id, name: error && error.name,
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    if (running === job) running = null;
    self.postMessage({ type: 'done', id: message.id });
  }
});
