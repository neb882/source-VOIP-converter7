/* TF2 Voice Emulator, engine/gain.js: the receiver's gain.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { clamp, finiteOr } = E.dsp;

  /* ------------------------------------------------------------------ */
  /* Receiver auto-gain (Source voice channel)                          */
  /*                                                                    */
  /* The engine's rule, read from its binary (docs/reports/W3-03-       */
  /* engine-binary.md, section 2) and verified sample for sample        */
  /* against the game's own decoded voice (Set H: 0 of 291,840 samples  */
  /* differ). Decoded voice is int16. Per sample x:                     */
  /*   sum += |x|; peak = max(peak, |x|)                                */
  /*   y = clamp((fixed + pos * step) * x >> 7, int16)  (32-bit, wraps) */
  /* and at the end of each 128-sample block, in 32-bit floats, each    */
  /* operation a separate scalar single-precision one, in this order    */
  /* (read from the binary; no fused multiply-add, no double):          */
  /*   current = next * scale; fixed = trunc(current * 128)             */
  /*   mean = floor(sum / 128)                    (integer division)    */
  /*   next = min(maxgain, 32767 / (mean + (peak - mean) * avggain))    */
  /*          * scale                 (a block of zeros: the cap)       */
  /*   step = trunc((next - current) / 127 * 128)                       */
  /* so voice_scale enters twice: a block starts at s*s*T_prev and      */
  /* ramps toward s*T. A reset (a channel assigned to a speaker) sets   */
  /* current = next = 1, fixed = 128, step = pos = sum = peak = 0, so   */
  /* the first block is at unity whatever voice_scale is.               */
  /* ------------------------------------------------------------------ */

  const GAIN_BLOCK = 128;   // the engine's block; the ramp divides by GAIN_BLOCK - 1

  // The rule's state and its sample loop, shared by receiverAutoGain,
  // streamAutoGain and createGain. options: { avgGain, maxGain, scale,
  // decoded }. decoded(m), when given, says whether sample m of the signal
  // (counted from the first sample run) was decoded; see receiverAutoGain.
  function gainRule(options = {}) {
    const f32 = Math.fround;
    const avgGain = f32(Math.max(0, finiteOr(options.avgGain, 0.5)));
    const maxGain = f32(Math.max(0, finiteOr(options.maxGain, 10)));
    const scale = f32(Math.max(0, finiteOr(options.scale, 1)));
    const decoded = typeof options.decoded === 'function' ? options.decoded : null;
    let current, next, fixed, step, pos, sum, peak;
    let index = 0;   // the next sample's place in the signal, for decoded()
    function reset() { current = next = 1; fixed = 128; step = 0; pos = 0; sum = 0; peak = 0; }
    reset();
    // x[i] for i in [0, x.length) into out[at + i].
    function run(x, out, at = 0) {
      for (let i = 0; i < x.length; i++) {
        const v = clamp(Math.round(x[i] * 32768), -32768, 32767);
        const a = v < 0 ? -v : v;
        sum += a;
        if (a > peak) peak = a;
        // As the engine computes it (read): g = fixed + pos * step and the
        // product g * x are 32-bit signed integers that keep the low 32 bits
        // (nothing widens or saturates), then an arithmetic shift by 7, then
        // the clamp. The product can wrap: at a block start g reaches
        // maxgain x scale^2 x 128, 204,800 at the app's limits (100 and 4),
        // and 204,800 x 32,768 passes 2^31. At the defaults and the page's
        // own limits (scale up to 2) it does not.
        const g = (fixed + Math.imul(pos, step)) | 0;
        const y = Math.imul(g, v) >> 7;
        out[at + i] = (y > 32767 ? 32767 : (y < -32768 ? -32768 : y)) / 32768;
        index++;
        if (++pos < GAIN_BLOCK) continue;
        if (peak === 0 && decoded && !decoded(index - GAIN_BLOCK)) {
          // Nothing arrived: the engine would not have run. The gain holds
          // where the ramp reached it. This stands in for the gaps on the
          // source's timeline, which the engine's gain never sees; its
          // blocks run over the decoded samples end to end, the app's over
          // the timeline, so it is an approximation of that timeline only.
          fixed += GAIN_BLOCK * step;
          step = 0;
        } else {
          current = f32(next * scale);
          fixed = Math.trunc(current * 128);
          const mean = Math.floor(sum / GAIN_BLOCK);
          const den = f32(mean + f32((peak - mean) * avgGain));   // the product, then the sum
          let t = f32(32767 / den);              // no test for zero: a zero blend gives +infinity
          t = t < maxGain ? t : maxGain;          // kept only if strictly less (a NaN gives the cap)
          next = f32(t * scale);
          step = Math.trunc(f32(f32(f32(next - current) / (GAIN_BLOCK - 1)) * 128));
        }
        pos = 0; sum = 0; peak = 0;
      }
      return out;
    }
    return { run, reset, state: () => ({ current, next, fixed, step, pos, sum, peak }) };
  }

  // The gain over a whole signal, from a reset (every render starts with a
  // channel being assigned). Samples are floats, run as int16
  // (round(x * 32768), clamped) and returned as y / 32768. A last, partial
  // block follows the current ramp and makes no update.
  // options.decoded(m): whether voice-rate sample m was decoded. Without it
  // every sample was, and every block is run by the rule, a block of zeros
  // included (its target is the cap). With it, an all-zero block whose
  // first sample was not decoded is skipped (the gain held, see gainRule).
  function receiverAutoGain(samples, options = {}) {
    return gainRule(options).run(samples, new Float32Array(samples.length));
  }

  // TF2Audio.createGain({ avgGain, maxGain, scale }): the gain of one voice
  // channel, fed decoded samples in pieces of any size. process(pcm)
  // returns as many samples at once (a sample's gain is known when it
  // arrives; a block's update happens when its 128th sample does, across
  // calls); reset() is a channel being assigned; state() copies the rule's
  // seven variables, for tests.
  function createGain(options = {}) {
    const rule = gainRule({ avgGain: options.avgGain, maxGain: options.maxGain, scale: options.scale });
    return {
      process: (pcm) => rule.run(pcm, new Float32Array(pcm.length)),
      reset: rule.reset,
      state: rule.state
    };
  }

  // The gain's decoded() when a gate holds frames back (Steam on the
  // source's timeline, a demo's received voice): voice-rate sample m is
  // codec sample c = floor(m * codecRate / voiceRate), in frame
  // floor((c + lookahead) / frameSamples), and was decoded when that
  // frame's code is not 0 (gated: nothing sent). The log is read when the
  // gain asks, so a stream may fill it as it goes. lookahead is what lies
  // between the gain's sample 0 and the decoder's: the codec's delay when
  // the gain runs on the signal with that delay dropped (the Opus profiles
  // of the frame path), 0 when it runs on the decoder's stream from its first
  // sample (the engine codecs since W3-19: gainLead) or on a demo's voice.
  function decodedFromFrames(frameLog, frameSamples, lookahead, codecRate, voiceRate) {
    return (m) => {
      const f = Math.floor((Math.floor(m * codecRate / voiceRate) + lookahead) / frameSamples);
      return f >= 0 && f < frameLog.length && frameLog[f] !== 0;
    };
  }

  // The engine codecs on the frame path (codec.engine: CELT, Speex, VR12)
  // with the gain on (W3-19): the game's gain works in blocks of 128 samples
  // counted from the first sample the decoder gives, so it runs on the
  // decoder's stream from that sample, the codec's delay (lookahead: 64
  // samples for celt_22, 128 for celt_44, 80 for speex, 305 for miles, whose
  // engines' gain routine is the same) included, and the delay is
  // dropped after it. The output keeps its length and alignment; only the
  // gain's block grid and its first block move. Returns how many samples the
  // gain runs on before the render's first: the lookahead, or 0 for every
  // other profile. The Opus profiles of the frame path drop the delay first,
  // as before: steam_48's 312 samples at 48 kHz are no whole number of
  // samples at its 44.1 kHz voice rate, so dropping them after the gain
  // would move the output (a decision of its own). `steam` lays decoded
  // packets and has its own path. The engine profiles' voice rate is their
  // codec's, so the resampler between decoder and gain passes the samples as
  // they are and the grid is counted on the decoder's own samples; one that
  // differed is refused here rather than given a grid nobody chose.
  function gainLead(codec, lookahead) {
    if (!codec.engine) return 0;
    if (Math.round(codec.voiceRate) !== Math.round(codec.codecRate) || codec.decoderEq) {
      throw new Error('An engine codec\'s gain runs on its decoder\'s samples: a voice rate equal to the codec\'s, no decoder EQ.');
    }
    return lookahead || 0;
  }

  // receiverAutoGain a piece at a time: each sample comes out as it goes in,
  // and the state (and options.decoded's count) carries across calls.
  // flush() ends the signal and gives nothing more: a last, partial block
  // has already followed the current ramp, as receiverAutoGain ends.
  function streamAutoGain(options = {}) {
    const rule = gainRule(options);
    return Object.assign((x) => rule.run(x, new Float32Array(x.length)), { flush: () => new Float32Array(0) });
  }

  E.gain = Object.freeze({
    GAIN_BLOCK, createGain, decodedFromFrames, gainLead, receiverAutoGain, streamAutoGain
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
