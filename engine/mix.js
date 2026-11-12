/* TF2 Voice Emulator, engine/mix.js: the mixer and the output stage.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { gcd, roundEven } = E.dsp;

  /* ------------------------------------------------------------------ */
  /* The mixer and the output stage (W3-10)                             */
  /*                                                                    */
  /* As the engine does it, on whole numbers (docs/reports/W3-07-mixer- */
  /* output.md, sections 1 and 2; docs/reports/W3-10-upsampler-read.md): */
  /*   - the voice is entered into the mix at its own rate, at the      */
  /*     channel's volume of 255: trunc(fround(s x 255) / 256) (mixEntry); */
  /*   - a 22050 Hz voice is upsampled by two once, an 11025 Hz voice   */
  /*     twice, each stage keeping its last input (mixUpsample2);       */
  /*   - the sum is clipped to +-32767, multiplied by `volume` in single */
  /*     precision and rounded to 16 bits, ties to even (mixOut).       */
  /* Then, outside the engine, the system's mixer converts the 16-bit   */
  /* 44100 Hz stream to the device's rate by linear interpolation       */
  /* (createDeviceStage): a model, fixed by the recordings, not read.   */
  /* There is no filter and no limiter anywhere in this.                */
  /* ------------------------------------------------------------------ */

  // The mixer's rate: a constant of the engine's code (VOICE_ENGINE.mixRate).
  const MIX_RATE = 44100;
  // The mixer's blocks: block b is mix samples MIX_BLOCK_ORIGIN + 512 b to
  // MIX_BLOCK_ORIGIN + 512 b + 511, counted from the first sample of a render
  // (or of a live chain at its mix point). Nothing in this order's arithmetic
  // depends on them (the entry and mixOut have no memory, the upsampler
  // carries its state); they are reported to opts.onMixBlock for the room's
  // slot (W3-17c). Under the game's timeline W3-02c will set the origin to
  // its channel clock's blocks. An origin that is not a multiple of 4 mix
  // samples would cut an 11025 Hz voice sample in two: a later order may set
  // it only for a 44100 Hz voice, or to a multiple of 4.
  const MIX_BLOCK = 512, MIX_BLOCK_ORIGIN = 0;
  // The voice channel's volume in the mix: 255, of a full scale of 256
  // (headphones, the default snd_surround_speakers -1; W3-07, section 1).
  const MIX_VOICE_VOLUME = 255;
  const NO_INTS = new Int32Array(0);

  // A voice-rate sample as the whole 16-bit value the mix is given. The
  // gain's output is one already (y / 32768); a value that is not (the
  // auto-gain off: the voice times voice_scale, clipped at +-32767) is
  // rounded to the nearest, ties to even, and clamped to -32768..32767.
  function mixSample(v) {
    const r = roundEven(v * 32768);
    return r > 32767 ? 32767 : r < -32768 ? -32768 : r;
  }

  // TF2Audio.mixEntry(s, volume): a whole 16-bit sample s entered into the
  // mix at the channel's volume, a single from 0 to 255 (narrowed here, so no
  // caller can hand it a double that is not one): the product rounded to
  // single precision once, divided by 256 (exact), truncated toward zero.
  // The engine's 16-bit mono mix (W3-07 section 1; the read, section 4).
  // At 255 the rounding changes nothing; W3-17c calls this twice a sample,
  // at 255 x 229 / 256 and 255 x 26 / 256, where it does.
  function mixEntry(s, volume) {
    const f = Math.fround;
    return Math.trunc(f(s * f(volume)) / 256);
  }

  // TF2Audio.mixUpsample2(x, state): one upsampling by two of a mixer
  // buffer, the engine's linear rule (the read, section 1): output 2k + 1 is
  // input k, output 2k the mean of inputs k - 1 and k, rounded down (an
  // arithmetic shift). state = { prev }, one per buffer and per stage, 0 at
  // first: the last input, kept across calls, so the result does not depend
  // on where the calls fall. x: integers (an Int32Array).
  function mixUpsample2(x, state) {
    const y = new Int32Array(2 * x.length);
    let prev = state.prev;
    for (let k = 0; k < x.length; k++) {
      y[2 * k] = (prev + x[k]) >> 1;
      y[2 * k + 1] = x[k];
      prev = x[k];
    }
    state.prev = prev;
    return y;
  }

  // TF2Audio.mixClip(v): the clip on the mix's sum, -32767..32767.
  function mixClip(v) {
    return v > 32767 ? 32767 : v < -32767 ? -32767 : v;
  }

  // TF2Audio.mixOut(sum, volume): the stage after the sum, on a whole sample
  // of the 44100 Hz mix: the clip; the clipped integer as a single times
  // `volume` as a single, the product rounded to single (the engine
  // converts the block to floats and multiplies by volume x (1 - soundfade);
  // soundfade is 0 in play and not modelled); then rounded to the nearest
  // integer, ties to even (the device call rounds to nearest). The ceiling
  // is round(32767 x volume): 4915 at 0.15.
  function mixOut(sum, volume) {
    const f = Math.fround;
    return roundEven(f(f(mixClip(sum)) * f(volume)));
  }

  // TF2Audio.mixDevicePosition(n, R): where output n of the device stage at
  // R Hz reads the 44100 Hz mix, in whole numbers: with g = gcd(44100, R),
  // N = 44100 / g and D = R / g, n N = D k + r with 0 <= r < D. Exact for
  // any n up to 2^40 and more (n is split by D first, so no product passes
  // 2^53).
  function mixDevicePosition(n, R) {
    const g = gcd(MIX_RATE, R), N = MIX_RATE / g, D = R / g;
    let q = Math.floor(n / D), m = n - q * D;
    if (m < 0) { q--; m += D; } else if (m >= D) { q++; m -= D; }
    const t = m * N, j = Math.floor(t / D);
    return { k: q * N + j, r: t - j * D };
  }

  // TF2Audio.createDeviceStage(R): the 16-bit 44100 Hz mix converted to the
  // listener's sound device at R Hz, an integer from 44100 up. A model of the
  // system's mixer (XAudio2, between the game and the device; W3-07, section
  // 2): linear interpolation with its phase starting at 0, which the
  // recordings fix (images 65 dB under a 1 kHz tone at 2900 and 4900 Hz, and
  // flat tops that stay exactly on the ceiling); its precision and rounding
  // were not read and are this model's, and only 48000 Hz was measured.
  // Output n, with k and r from mixDevicePosition(n, R), is
  //   roundEven((x[k] (D - r) + x[k + 1] r) / D)
  // exactly: the numerator is a whole number, a tie is a remainder of D / 2,
  // and it goes to the even neighbour. An input past the mix's end is 0.
  // Stateful: it keeps the inputs from the next output's k on, waits for
  // x[k + 1], and gives the same samples at any chunking. push(x) takes
  // integers and gives integers; flush() ends the mix (the outputs that read
  // its last input). At 44100 Hz there is no stage: the mix passes as it is.
  function createDeviceStage(R) {
    if (R === MIX_RATE) return { push: (x) => x, flush: () => NO_INTS };
    if (!Number.isInteger(R) || R < MIX_RATE) throw new RangeError(`TF2Audio: the device stage takes a rate from 44100 Hz up, not ${R}.`);
    const D = R / gcd(MIX_RATE, R);
    let buf = NO_INTS, base = 0, total = 0, n = 0;
    const input = (i) => (i < total ? buf[i - base] : 0);
    // The outputs whose k is at most `last`.
    function run(last) {
      const out = [];
      for (;; n++) {
        const { k, r } = mixDevicePosition(n, R);
        if (k > last) break;
        const num = input(k) * (D - r) + input(k + 1) * r;
        let q = Math.floor(num / D), rem = num - q * D;
        if (rem < 0) { q--; rem += D; } else if (rem >= D) { q++; rem -= D; }
        if (2 * rem > D || (2 * rem === D && (q & 1))) q++;
        out.push(q);
      }
      const keep = Math.min(total, mixDevicePosition(n, R).k);
      if (keep > base) { buf = buf.slice(keep - base); base = keep; }
      return Int32Array.from(out);
    }
    return {
      push(x) {
        const merged = new Int32Array(buf.length + x.length);
        merged.set(buf); merged.set(x, buf.length);
        buf = merged; total += x.length;
        return run(total - 2);
      },
      flush: () => run(total - 1)
    };
  }

  // The voice's entry and the upsampling, for a voice at voiceRate (11025,
  // 22050 or 44100 Hz: the voice's own rate, never a codec's mode rate): each
  // voice-rate sample as mixSample makes it, entered by mixEntry at the
  // voice's volume, then upsampled once for 22050 Hz and twice for 11025 Hz,
  // each stage with its own state from 0 (the mixer's facing buffer: nothing
  // resets it, not a new spurt and not a block). Gives the mix's integers at
  // 44100 Hz. flush() ends the voice: a voice sample of zeros through the
  // stages gives the last mean, and the zeros after it are not part of the
  // mix, so a voice of N samples gives a mix of exactly 2N + 1 at 22050 Hz
  // and 4N + 3 at 11025 Hz (N at 44100 Hz, none for no voice). A voice
  // sample k sits at mix sample 2k + 1 (4k + 3): one 44100 Hz sample per
  // stage later than its own time, as in the game.
  function createMixEntry(voiceRate, volume = MIX_VOICE_VOLUME) {
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[voiceRate];
    if (stages === undefined) throw new RangeError(`TF2Audio: the mixer takes a voice at 11025, 22050 or 44100 Hz, not ${voiceRate}.`);
    const states = Array.from({ length: stages }, () => ({ prev: 0 }));
    let fed = 0;
    const up = (e) => { for (const st of states) e = mixUpsample2(e, st); return e; };
    return {
      push(x) {
        const e = new Int32Array(x.length);
        for (let i = 0; i < x.length; i++) e[i] = mixEntry(mixSample(x[i]), volume);
        fed += x.length;
        return up(e);
      },
      flush() {
        if (!stages || !fed) return NO_INTS;
        return up(new Int32Array(1)).subarray(0, (1 << stages) - 1);
      }
    };
  }

  const mixToFloat = (x) => Float32Array.from(x, (v) => v / 32768);

  // The voice's mix with a room on or under water (W3-17c; the order's part
  // c, item 4), in the engine's order (W3-07 section 1; the order's Decision
  // 3): at the voice's own rate each sample is entered twice by mixEntry,
  // at the volumes 255 x direct / 256 and 255 x room / 256, the shares the
  // room path gives for the 512-sample mixer block the sample's mix samples
  // fall in (asked at the block's start, before the path runs it); each of
  // the two buffers is upsampled by mixUpsample2 with states of its own
  // (none for a 44100 Hz voice); the path (room-dsp.js createRoomPath) adds
  // the room slot's output to the direct buffer and, under water, runs the
  // sum through the water preset. Its output is the sum before the clip,
  // which goes on to W3-10's blocks, mixOut and device stage unchanged.
  //   The path is given whole blocks, each starting on a block's first
  // sample, counted from the render's first mix sample (MIX_BLOCK_ORIGIN 0,
  // the path's own count): a block is 512 voice samples at 44100 Hz, 256 at
  // 22050 and 128 at 11025 (a voice sample's mix samples never straddle two
  // blocks). So the stream keeps the voice's partial block until it is
  // whole: up to 511 mix samples. Nothing else is held back.
  //   flush() ends the voice. The voice's last block is filled with zeros
  // and, after it, blocks of zeros run until the path's tail rule holds
  // (room-dsp.js tailLeft: Decision 8): the mix is the voice's own mix (N,
  // 2N + 1 or 4N + 3 samples, as W3-10 makes it; zeros follow it) and the
  // tail, cut at the sample where the rule held, or at the voice's own end
  // if it held before that. tail() then gives the tail's length in mix
  // samples, what the mix runs on past the voice's own end (0 to 882,000).
  // An empty voice gives the path zeros from the start: the rule holds
  // after 22,050 of them, the room's silent tail.
  function createRoomMix(voiceRate, room) {
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[voiceRate];
    if (stages === undefined) throw new RangeError(`TF2Audio: the mixer takes a voice at 11025, 22050 or 44100 Hz, not ${voiceRate}.`);
    const per = MIX_BLOCK >> stages, path = room.path;
    const directStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const roomStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const up = (e, states) => { for (const st of states) e = mixUpsample2(e, st); return e; };
    const held = new Int32Array(per);
    let fill = 0, fed = 0, start = 0, ruleEnd = -1, tail = 0;
    // The held voice samples (zeros past `fill`) as one mixer block.
    function block() {
      const asked = path.shares(), sh = room.shares || asked;
      const vd = MIX_VOICE_VOLUME * sh.direct / 256, vr = MIX_VOICE_VOLUME * sh.room / 256;
      const direct = new Int32Array(per), wet = new Int32Array(per);
      for (let i = 0; i < per; i++) { direct[i] = mixEntry(held[i], vd); wet[i] = mixEntry(held[i], vr); }
      const out = path.process(up(direct, directStates), up(wet, roomStates));
      // Where the tail rule last held (the mix sample after it), or -1 while
      // a voice sample has started it over since.
      const t = path.tailLeft();
      if (!t.ended) ruleEnd = -1;
      else if (t.at >= 0) ruleEnd = start + t.at + 1;
      start += MIX_BLOCK;
      return out;
    }
    return {
      push(x) {
        const parts = [];
        for (let i = 0; i < x.length; i++) {
          held[fill++] = mixSample(x[i]);
          if (fill === per) { parts.push(block()); fill = 0; }
        }
        fed += x.length;
        return parts.length ? joinInts(parts) : NO_INTS;
      },
      flush() {
        const voiceEnd = fed ? fed * (1 << stages) + (1 << stages) - 1 : 0, from = start, parts = [];
        // The rule holds at the latest TAIL_CAP samples after the voice's
        // last sample, which lies in the first of these blocks: a loop that
        // runs past that has met a path that does not end, and stops.
        const most = Math.ceil(room.cap / MIX_BLOCK) + 2;
        let blocks = 0;
        do {
          if (++blocks > most) {
            throw new Error(`TF2Audio: the room's tail did not end within its cap of ${room.cap} mixer samples (${most} blocks after the voice).`);
          }
          held.fill(0, fill);
          fill = 0;
          parts.push(block());
        } while (ruleEnd < 0);
        const end = Math.max(voiceEnd, ruleEnd);
        tail = end - voiceEnd;
        return joinInts(parts).subarray(0, end - from);
      },
      tail: () => tail
    };
  }

  // The live chain's mix stage (W3-17d): the room switched on and off at a
  // mixer block's start, without a new chain. `holder` is the live monitor's
  // worker's: { path, attached, onBlock?, onSwitch? }; path a room path
  // (room-dsp.js createRoomPath) kept across chains, attached whether the mix
  // runs it now. Not attached, the voice is entered at 255 and upsampled
  // (createMixEntry's arithmetic), sample by sample, holding nothing back.
  // Attached, each 512-sample block is a render's room block (createRoomMix's
  // arithmetic: the path's shares at the block's start, two entries, each part
  // upsampled on its own, the path's sum), so up to 511 mix samples are held
  // back. The switch is taken at a block start after `attached` changes. The
  // direct part's upsampler states run on through it. A path is let go only
  // at the start of a block after one whose room share was 0 and once the
  // room part's upsampler states have run out to 0 (one block more after the
  // last room entry, at most): the block in which the slot drops a faded-out
  // room has its shares from before the drop, and its last room entry is
  // still in those states. So the room part is all zeros when it stops, the
  // idle path's sum is the direct part alone, and nothing of the room is cut.
  // Attached again, the room part's states start from 0, as they stood. So
  // letting the path go and attaching it again changes no sample against the
  // path left attached; one attached with a room fades it in with the slot's
  // own fade.
  // holder.holding says whether the stage holds samples back now. onBlock
  // (the block's first voice sample, counted from the chain's first) and
  // onSwitch(attached, that sample) are tests' hooks. A chain never flushes.
  function createLiveRoomMix(voiceRate, holder) {
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[voiceRate];
    if (stages === undefined) throw new RangeError(`TF2Audio: the mixer takes a voice at 11025, 22050 or 44100 Hz, not ${voiceRate}.`);
    const per = MIX_BLOCK >> stages;
    const directStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const roomStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const up = (e, states) => { for (const st of states) e = mixUpsample2(e, st); return e; };
    const held = new Int32Array(per);
    let phase = 0, at = 0, lastRoom = 0, active = !!(holder.attached && holder.path);
    holder.holding = active;
    if (active && holder.onSwitch) holder.onSwitch(true, 0);
    // The block's update and shares are taken at its first sample, as the
    // engine's mixer takes them before the block, so a room asked for while
    // a block is held is taken at the next block, as when no block is held.
    let sh = null;
    function begin(start) {
      if (holder.onBlock) holder.onBlock(start);
      sh = holder.path.shares();
      lastRoom = sh.room;
    }
    function block() {
      const path = holder.path;
      const vd = MIX_VOICE_VOLUME * sh.direct / 256, vr = MIX_VOICE_VOLUME * sh.room / 256;
      const direct = new Int32Array(per), wet = new Int32Array(per);
      for (let i = 0; i < per; i++) { direct[i] = mixEntry(held[i], vd); wet[i] = mixEntry(held[i], vr); }
      return path.process(up(direct, directStates), up(wet, roomStates));
    }
    return {
      push(x) {
        const parts = [];
        let run = [];
        const dry = () => {
          if (!run.length) return;
          const e = Int32Array.from(run, (v) => mixEntry(v, MIX_VOICE_VOLUME));
          parts.push(up(e, directStates));
          run = [];
        };
        for (let i = 0; i < x.length; i++, at++) {
          if (phase === 0) {
            let want = !!(holder.attached && holder.path);
            // Not let go while the room part still has something in it.
            if (active && !want && (lastRoom !== 0 || roomStates.some((st) => st.prev !== 0))) want = true;
            if (want && !active) for (const st of roomStates) st.prev = 0;
            if (want !== active) {
              dry();
              active = want;
              holder.holding = active;
              if (holder.onSwitch) holder.onSwitch(active, at);
            }
          }
          const v = mixSample(x[i]);
          if (active) {
            if (phase === 0) begin(at);
            held[phase] = v;
            if (phase === per - 1) parts.push(block());
          } else run.push(v);
          phase = phase === per - 1 ? 0 : phase + 1;
        }
        dry();
        return parts.length ? joinInts(parts) : NO_INTS;
      },
      flush: () => NO_INTS
    };
  }

  // The mixer's blocks, reported to onMixBlock(start, length, mix), a test
  // hook: once each block's last sample has passed, and at the end a short
  // last block (flush); start counts from the first mix sample (a multiple
  // of 512), mix is a copy of the block's sum before the clip. The samples
  // pass on as they come: nothing is held back for a block, and with no hook
  // nothing is kept. (Holding a partial block until it is whole is W3-17c's,
  // with a room on.)
  function createMixBlocks(onMixBlock) {
    if (typeof onMixBlock !== 'function') return { push: (x) => x, flush: () => NO_INTS };
    const block = new Int32Array(MIX_BLOCK);
    let pos = 0, fill = 0;
    const report = () => { onMixBlock(pos - fill, fill, block.slice(0, fill)); fill = 0; };
    return {
      push(x) {
        for (let i = 0; i < x.length; i++) {
          block[fill++] = x[i];
          pos++;
          if ((pos - MIX_BLOCK_ORIGIN) % MIX_BLOCK === 0) report();
        }
        return x;
      },
      flush() { if (fill) report(); return NO_INTS; }
    };
  }

  function createMixOut(volume) {
    return {
      push(x) {
        const y = new Int32Array(x.length);
        for (let i = 0; i < x.length; i++) y[i] = mixOut(x[i], volume);
        return y;
      },
      flush: () => NO_INTS
    };
  }

  function joinInts(parts) {
    if (parts.length === 1) return parts[0];
    const out = new Int32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }

  // Stages in a row as one: push() runs each in turn; flush() flushes each
  // in turn and runs what it gives through the ones after it, so a stage's
  // end reaches the next before that one ends.
  function stageChain(parts) {
    const through = (k, x) => { for (; k < parts.length; k++) x = parts[k].push(x); return x; };
    return {
      push: (x) => through(0, x),
      flush() {
        const out = [];
        for (let k = 0; k < parts.length; k++) out.push(through(k + 1, parts[k].flush()));
        return joinInts(out);
      }
    };
  }

  // The mix from the gain's output: the entry and the upsampling, or with a
  // room (a resolved room, below) createRoomMix.
  const createMixStage = (voiceRate, room) => (room ? createRoomMix(voiceRate, room) : createMixEntry(voiceRate));
  // From the mix's sum to the device: the blocks, mixOut, the device stage.
  const createOutStage = (volume, deviceRate, onMixBlock) =>
    stageChain([createMixBlocks(onMixBlock), createMixOut(volume), createDeviceStage(deviceRate)]);

  // TF2Audio.createOutputStage({ voiceRate, volume, deviceRate, onMixBlock }):
  // the whole stage, from the gain's output (voice-rate floats) to the
  // device's 16-bit integers, a piece at a time: what createRender and the
  // live chain run after their mix point. push(x) gives what became final;
  // flush() ends the voice. `room` (a render's resolved room) puts the room
  // into the mix; mix.tail() then gives the tail's length in mix samples.
  function createOutputStage({ voiceRate, volume, deviceRate = MIX_RATE, onMixBlock, room = null, liveRoom = null }) {
    const mix = liveRoom ? createLiveRoomMix(voiceRate, liveRoom) : createMixStage(voiceRate, room);
    return Object.assign(stageChain([mix, createOutStage(volume, deviceRate, onMixBlock)]), { mix });
  }

  // The device's rate from opts.deviceRate: an integer from 44100 to 192000;
  // anything else (a string, a fraction, a rate below 44100) is
  // VOICE_ENGINE.deviceRate. Only 48000 Hz is measured; another rate runs
  // the same rule.
  function deviceRateOf(value) {
    return Number.isInteger(value) && value >= 44100 && value <= 192000 ? value : VOICE_ENGINE.deviceRate;
  }

  E.mix = Object.freeze({
    MIX_BLOCK, MIX_RATE, createDeviceStage, createMixStage, createOutStage, createOutputStage, deviceRateOf,
    joinInts, mixClip, mixDevicePosition, mixEntry, mixOut, mixToFloat, mixUpsample2
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
