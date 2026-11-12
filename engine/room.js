/* TF2 Voice Emulator, engine/room.js: the room's settings and what the mix is told.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { clamp, finiteOr } = E.dsp;
  const { MIX_RATE } = E.mix;

  /* ------------------------------------------------------------------ */
  /* The room (W3-17c)                                                  */
  /*                                                                    */
  /* room-dsp.js (TF2Room) and its table room-presets.js                */
  /* (TF2_ROOM_PRESETS) are the engine's arithmetic as read (order      */
  /* W3-17, parts a and b). This file reads them as globals, loaded     */
  /* before it (index.html, the workers' importScripts), and only for a */
  /* render with a room or under water; without them such a render     */
  /* stops and names them. The mix stage is createRoomMix, in           */
  /* `engine/mix.js`.                                                   */
  /* ------------------------------------------------------------------ */

  function roomModule() {
    const R = typeof TF2Room !== 'undefined' ? TF2Room : null;
    const table = typeof TF2_ROOM_PRESETS !== 'undefined' ? TF2_ROOM_PRESETS : null;
    if (!R || typeof R.createRoomPath !== 'function' || !table) {
      throw new Error('TF2Audio: a room or under water needs room-dsp.js (TF2Room) and room-presets.js (TF2_ROOM_PRESETS), loaded before audio.js.');
    }
    return { R, table };
  }

  // The custom room's knobs when a render gives none (the page's own
  // defaults; DSP_PRESETS[99] held them until W3-17d).
  const CUSTOM_ROOM = { duration: 1.5, decay: 3, mix: 0.25 };

  // The custom room (dsp_room 99: the app's own, not the game's) on the
  // engine's processors, as a preset of the table's form, its knobs mapped
  // as the old room code mapped them: a two-stage all-pass diffusor, then a
  // reverb of five lines from 12 ms to duration x 60 ms (25 to 220 ms), the
  // first line's feedback 0.001^(0.045 / duration) (0.3 to 0.97: a decay of
  // about `duration` seconds), gain 1.2, a low-pass in the loop at 9000 /
  // decay Hz (800 to 12000; not one of the module's pinned cutoffs, so it is
  // computed). Its shares are not the header's: trunc(mix x 256) to the
  // room, trunc(256 - mix x 256) direct (resolveRoom). At a high mix its
  // 32-bit products can wrap, as the engine's own do at a fully wet share.
  function customPreset(env) {
    const values = (v) => v.concat(new Array(16 - v.length).fill(0));
    const feedback = clamp(Math.pow(0.001, 0.045 / env.duration), 0.3, 0.97);
    const cutoff = clamp(9000 / env.decay, 800, 12000);
    return { name: 'custom', h: [env.mix, env.mix, 0, 0, 0, 0],
      p: [[10, values([1, 2, 0.15])], [2, values([clamp(env.duration * 60, 25, 220), 12, 5, feedback, 1.2, cutoff, 1])]] };
  }

  // What the options ask of the room: { spec, water }. spec is null (no
  // room), { preset: n }, { auto: key or measures } or { custom: { duration,
  // decay, mix } }; water is opts.underwater. The page sends opts.room and
  // opts.underwater (W3-17d). With no opts.room the older options are read
  // and mapped, so no caller breaks: a listenerPos of LISTENER_POSITIONS
  // gives its room (a place of the page, W3-17d) or, for a position of the
  // page before W3-17d, the preset number it stood for, and `water` under
  // water with no room; else dspRoom gives that preset, 99 the custom room
  // with customEnv's knobs. When opts.room is given (null included) it is
  // the room, and under water is opts.underwater alone.
  function roomRequest(opts) {
    const pos = typeof opts.listenerPos === 'string' && Object.hasOwn(LISTENER_POSITIONS, opts.listenerPos) ? opts.listenerPos : null;
    let spec = opts.room;
    const water = !!opts.underwater || (spec === undefined && pos === 'water');
    if (spec === undefined) {
      const n = dspRoomNumber(opts.dspRoom);
      const place = pos ? LISTENER_POSITIONS[pos] : null;
      if (pos) spec = pos === 'water' ? null : place.room !== undefined ? place.room : { preset: place.dsp };
      else if (n !== null) spec = n === 99 ? { custom: opts.customEnv || {} } : { preset: n };
      else spec = null;
    }
    return { spec: spec && typeof spec === 'object' ? spec : null, water };
  }

  // dspRoom as a number: a whole number, or a string of decimal digits as a
  // number is written (no sign, space, leading zero, exponent or other
  // base); anything else is null, no room, as the old code's key lookup in
  // DSP_PRESETS made it (" 6", "0x6", "6e0" and "06" were no room there).
  function dspRoomNumber(d) {
    if (typeof d === 'number') return Number.isInteger(d) ? d : null;
    return typeof d === 'string' && /^(0|[1-9][0-9]*)$/.test(d) ? Number(d) : null;
  }

  // A render's room (W3-17c, the order's part c, items 2 and 3), or null for
  // no room and not under water: then nothing of the room runs, no path is
  // made and the module is not needed (Decision 4). No room: null,
  // { preset: 0 }, { preset: 1 } alone (the automatic room with nothing
  // built yet, which is dry), a number the table does not hold (Decision
  // 11: 30 to 101, the diffuse pairs, 134 and up), a custom room whose
  // trunc(mix x 256) is 0. A room: { preset: n } for a number the table
  // holds (2 to 29, and the automatic room's templates); { auto } built by
  // buildAutomatic from a case's key or the measures; { custom }.
  //   Otherwise { path, shares, cap, info }: the room path made for the render's
  // first sample, the room set (no fade at the start) and under water from
  // the start if asked (its water preset already settled), its random taps
  // drawn from the render's seed (Decision 7); spurtStart() called once,
  // now: a render has no voice channel yet, so the one channel starts with
  // it (W3-02c will call it at each channel it opens). shares is the custom
  // room's own shares, or null for the path's; cap the tail's cap (in mixer
  // samples, the module's TAIL_CAP); info is codecInfo.room.
  function resolveRoom(opts, seed) {
    const { preset, info, shares, water } = roomPreset(opts);
    if (preset === null && !water) return null;
    const { R, table } = roomModule();
    const path = R.createRoomPath({ seed, room: preset, water, table });
    path.spurtStart();
    const sh = shares || path.shares();
    return { path, shares, cap: R.TAIL_CAP, info: { ...info, shares: { room: sh.room, direct: sh.direct }, underwater: water } };
  }

  // TF2Audio.roomPreset(opts): what resolveRoom builds a path from, without
  // the path: { preset, info, shares, water, unheld }. preset is a table
  // number, a built preset (the automatic room's, the custom room's) or null
  // for no room; info is codecInfo.room's start; shares the custom room's
  // own, or null; water whether under water; unheld the number asked for
  // when the table does not hold it (no room in a render; the live chain
  // leaves the room as it was: Decision 11), else null. The live monitor's
  // worker sets its room path from it (W3-17d).
  function roomPreset(opts) {
    const { spec, water } = roomRequest(opts);
    let preset = null, info = null, shares = null, unheld = null;
    if (spec && spec.custom !== undefined) {
      const c = spec.custom && typeof spec.custom === 'object' ? spec.custom : {};
      const env = { duration: clamp(finiteOr(c.duration, CUSTOM_ROOM.duration), 0.05, 6),
        decay: clamp(finiteOr(c.decay, CUSTOM_ROOM.decay), 0.5, 8), mix: clamp(finiteOr(c.mix, CUSTOM_ROOM.mix), 0, 1) };
      if (Math.trunc(env.mix * 256) > 0) {
        preset = customPreset(env);
        info = { custom: env };
        shares = { room: Math.trunc(env.mix * 256), direct: Math.trunc(256 - env.mix * 256) };
      }
    } else if (spec && spec.auto !== undefined) {
      const { R, table } = roomModule();
      const b = R.buildAutomatic(spec.auto, { table });
      preset = b.preset;
      info = { auto: b.key, ...(b.key === null ? { measures: { ...b.measures } } : {}), shape: b.shape, shaft: b.shaft,
        classes: { ...b.classes }, pair: [...b.pair], copy: b.copy };
    } else if (spec && Number.isInteger(spec.preset) && spec.preset !== 0 && spec.preset !== 1) {
      const { R, table } = roomModule();
      if (R.presetOf(spec.preset, table)) {
        preset = spec.preset;
        info = { preset: spec.preset };
      } else unheld = spec.preset;
    }
    return { preset, info, shares, water, unheld };
  }

  // A tail of `mix` samples at 44100 Hz as samples at the device's rate:
  // what it adds to the output's length.
  const tailAtDevice = (mix, deviceRate) => Math.round(mix * deviceRate / MIX_RATE);

  E.room = Object.freeze({
    resolveRoom, roomModule, roomPreset, tailAtDevice
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
