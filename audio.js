/* TF2 Voice Emulator — local DSP and codec orchestration.
 *
 * Sender:   mono capture (left channel by default) -> capture gain / int16
 *           clip -> resample to the codec rate -> optional capture filters
 *           -> Steam capture roll-off -> Steam voice gate (pre-roll, hold, one
 *           encoder per talk spurt) -> libopus 1.1.5 encode, as in Steam
 * Network:  `steam`: each sender message is one packet, lost whole by its
 *           own draw (BC-1); the other profiles: 20 ms packets grouped by
 *           net_split, lost in bursts (the earlier fit); late (jittered)
 *           frames on every profile; all seeded
 * Receiver: libopus 1.1.5 decode + native concealment and comfort noise ->
 *           engine voice rate -> Source-style auto-gain with int16 clamp ->
 *           the 44.1 kHz mixer as integers (the voice entered at 255/256,
 *           upsampled by two for the engine codecs; with a room entered
 *           twice, its room share through the room's slot, and under water
 *           the sum through the water preset) -> clip, volume and 16-bit
 *           rounding -> the listener's device rate by linear interpolation
 *           (48 kHz by default)
 *
 * The Steam profile, voice gate and receiver path are identified from 2026
 * voice_loopback recordings of music, speech and a calibrated test signal,
 * and from Steam's own voice packets in a SourceTV demo
 * (tests/REFERENCE_2026.md). The room is the engine's arithmetic as read
 * (room-dsp.js and its table room-presets.js, order W3-17), loaded before
 * this file as the globals TF2Room and TF2_ROOM_PRESETS; a render with no
 * room and not under water does not need them.
 * Same decoded PCM + settings + pinned runtime gives repeatable output.
 *
 * TF2Audio.process(buffer, opts) -> { samples, sampleRate, blob, codecInfo }
 * TF2Audio.createRender(source, opts) -> the same render, a chunk at a time
 * TF2Audio.createGain({ avgGain, maxGain, scale }) -> one channel's auto-gain
 * TF2Audio.encodeWav(samples, rate) -> 16-bit mono WAV
 *
 * The engine's files, in load order. Each is one function that adds its part
 * to TF2Engine (engine/dsp.js makes it); this file loads after them, takes
 * from the parts what it needs and builds TF2Audio:
 * - engine/dsp.js: signal arithmetic with nothing of the game in it: the
 *   seeded draw, the yield, the FFT, the downmix, the resampler, the filters,
 *   the clip, 16-bit rounding and the WAV, each whole and a piece at a time.
 * - engine/gain.js: the receiver's gain.
 * - engine/mix.js: the mixer and the output stage.
 * - engine/network.js: loss and jitter: the retiming, the loss masks, the
 *   steam profile's loss by message and its arrival times (BC-4).
 * - engine/codec.js: what the renderers share about a profile and its codec:
 *   the gate's defaults and threshold, the profile's filters, the frame
 *   codes, a demo's frame statistics, the call to the loader.
 * - engine/room.js: the room's settings and what the mix is told.
 * - engine/steam.js: the steam profile: its constants, its capture, its
 *   sender's options, its timeline, its codec information.
 * - engine/render.js: `process`, and the stages it keeps (W4-01b).
 * - engine/render-stream.js: `createRender`: the same render a piece at a
 *   time.
 * - engine/live-chain.js: `createLiveChain`: the live monitor's chain.
 */

(function () {
  'use strict';
  const E = (typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis).TF2Engine;
  const { applyBiquad, applyFirZeroPhase, biquadCoefs, bufferToMono, encodeWav, firwin2, hardClip, mulberry32,
    resampleLinear, resampleSinc, streamFir, streamResampleSinc, toInt16 } = E.dsp;
  const { createGain, decodedFromFrames, receiverAutoGain, streamAutoGain } = E.gain;
  const { createDeviceStage, createOutputStage, mixClip, mixDevicePosition, mixEntry, mixOut, mixUpsample2 } = E.mix;
  const { buildLossMask, fakeLagList, steamArrivals, steamMessageLoss, streamLossMask } = E.network;
  const { roomPreset } = E.room;
  const { steamFits, steamGiveOut } = E.steam;
  const { AFTER_A_OPTIONS, AFTER_B_OPTIONS, READ_OPTIONS, STAGE_OBSERVERS, previewAllowed, process, stageKeys,
    stagesHold } = E.render;
  const { createRender } = E.renderStream;
  const { createLiveChain } = E.liveChain;

  // The same pinned codec runs in browsers, workers, and the Node tests.
  // Tests inject the module because their DSP sandbox has no import loader.
  let opusModulePromise;
  function loadOpusModule() {
    if (typeof TF2Opus !== 'undefined') return Promise.resolve(TF2Opus);
    if (!opusModulePromise) {
      opusModulePromise = import('./opus-codec.mjs').catch(error => {
        opusModulePromise = null;
        throw new Error('The bundled Opus codec could not load. Serve the complete folder over HTTP(S). ' +
          error.message);
      });
    }
    return opusModulePromise;
  }

  E.audio = Object.freeze({ loadOpusModule });

  /* ------------------------------------------------------------------ */
  /* Public surface                                                     */
  /* ------------------------------------------------------------------ */

  const TF2Audio = {
    process,
    // the stages a render keeps (W4-01b): which place a render would start
    // from, the keys, the lists the keys are made by and every option
    // process() reads, and whether a render's first seconds are the whole
    // render's (step 3)
    stagesHold,
    stageKeys,
    STAGE_OPTIONS: Object.freeze({ afterB: Object.freeze([...AFTER_B_OPTIONS]), afterA: Object.freeze([...AFTER_A_OPTIONS]),
      observers: Object.freeze([...STAGE_OBSERVERS]), read: Object.freeze([...READ_OPTIONS]) }),
    previewAllowed,
    encodeWav,
    toInt16,
    bufferToMono,
    // exposed for tests / tools
    resampleSinc,
    resampleLinear,
    firwin2,
    applyFirZeroPhase,
    hardClip,
    receiverAutoGain,
    createGain,
    decodedFromFrames,
    biquadCoefs,
    applyBiquad,
    mulberry32,
    buildLossMask,
    // jitter on `steam` as arrival times (BC-4): one of net_fakelag's lists,
    // and the path of a listen server's own voice
    fakeLagList,
    steamArrivals,
    createLiveChain,
    createRender,
    roomPreset,
    streamResampleSinc,
    streamFir,
    streamAutoGain,
    streamLossMask,
    steamGiveOut,
    steamMessageLoss,
    steamFits,
    // the mixer and the output stage (W3-10); a room's mix (W3-17c) calls
    // the first two, its entries checked against TF2Room.entry
    mixEntry,
    mixUpsample2,
    mixOut,
    mixClip,
    mixDevicePosition,
    createDeviceStage,
    createOutputStage
  };

  if (typeof window !== 'undefined') window.TF2Audio = TF2Audio;
  else if (typeof self !== 'undefined') self.TF2Audio = TF2Audio;
  else if (typeof globalThis !== 'undefined') globalThis.TF2Audio = TF2Audio;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2Audio;
})();
