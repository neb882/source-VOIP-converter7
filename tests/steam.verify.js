/* =========================================================================
 * tests/steam.verify.js: the steam profile, Steam's sender and decoder, in a
 * render and in the live chain.
 *
 * Its three sections were tests/verify.js's until S3-01a and were moved from
 * it unedited, with their labels kept ([5c], [5d], and [10b] for steam), so a
 * report that cites "verify.js [5c]" finds the label here:
 *     node tests/steam.verify.js
 * TF2_DIR points the suite at a copy of the sources elsewhere.
 * ========================================================================= */

'use strict';

const path = require('path');
const { loadEngine, sourceRoot } = require('./lib/engine.cjs');
const { mkBuffer, tone, speechLike, rms, peakAbs, db } = require('./lib/signals.cjs');

const root = sourceRoot();
// The engine in this realm, from the tests' one loader; the codec module is
// set in main().
const engine = loadEngine({ root });
const TF2Audio = engine.audio;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok    ${name}${detail ? '   [' + detail + ']' : ''}`); }
  else      { fail++; console.error(`  FAIL  ${name}${detail ? '   [' + detail + ']' : ''}`); }
}

/* ---------------- the steam profile (W3-11a) ---------------- */

// The `steam` render sends as Steam's client does and decodes as its decoder
// does (docs/work-orders/W3-11-steam-gate.md, part a). Sources are made at
// 24 kHz, so no resampler stands between a test and the gate: the capture is
// the source, clipped, through the profile's capture roll-off, rounded to 16
// bits, as process() makes it.
async function steamSection() {
  console.log('\n[5c] The steam profile: Steam\'s sender and decoder (W3-11a)');
  const R = 24000, VR = 44100, opus = engine.codec;
  // The test's own copies, in this realm (the sender takes only this realm's Int16Array).
  const Sender = require(path.join(root, 'steam-sender.js')), Swr = require(path.join(root, 'vendor/swresample/swresample.js'));
  const PROFILES = engine.CODEC_PROFILES, steam = PROFILES.steam;
  const eqTaps = TF2Audio.firwin2(steam.captureEq.taps, steam.captureEq.freqs, steam.captureEq.gainsDb, R);
  const round16 = (y) => Int16Array.from(y, (v) => {
    const s = v * 32768;
    let r = Math.round(s);
    if (r - s === 0.5 && (r & 1)) r -= 1;
    return Math.max(-32768, Math.min(32767, r));
  });
  const captured = (x) => round16(TF2Audio.applyFirZeroPhase(TF2Audio.hardClip(x, 32767 / 32768), eqTaps));
  const senderOf = (x, opts = {}) => {
    const s = Sender.createSender(opts), msgs = s.push(captured(x));
    for (const m of s.finish()) msgs.push(m);
    return { msgs, info: s.info() };
  };
  const holding = (msgs) => msgs.filter((m) => m.silence !== undefined || m.last >= m.first).length;
  // The test hooks: each message's 16-bit samples as given to the resampler,
  // each packet() result, and the voice-rate signal after the gain.
  const hooked = () => {
    const h = { decoded: [], resampled: [], gained: null };
    h.opts = {
      onDecoded: (p, m) => h.decoded.push({ pcm: Int16Array.from(p), msg: JSON.parse(JSON.stringify({ ...m, pcm: undefined })) }),
      onResampled: (y, m) => h.resampled.push({ y: Int16Array.from(y), msg: JSON.parse(JSON.stringify({ ...m, pcm: undefined })) }),
      onGain: (g) => { h.gained = Float32Array.from(g); }
    };
    return h;
  };
  const render = (x, opts = {}, h = null) => TF2Audio.process(mkBuffer(x, R), { codec: 'steam', volume: 1, ...opts, ...(h ? h.opts : {}) });
  // A hand-made loss mask through the codec module's makeLossMask hook.
  const withMask = async (make, run) => {
    const real = engine.codec;
    engine.codec = { ...real, steamRoundTrip: (m, b, o) => real.steamRoundTrip(m, b, { ...o, makeLossMask: make }) };
    try { return await run(); } finally { engine.codec = real; }
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const sine = (f, seconds, peak) => Float32Array.from({ length: Math.round(seconds * R) }, (_, i) => peak * Math.sin(2 * Math.PI * f * i / R));
  // Seeded speech-like talk: voiced syllables on a noise floor, with pauses.
  const talk = (seconds, seed, level = 0.2) => {
    const rnd = TF2Audio.mulberry32(seed), n = Math.round(seconds * R), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 3e-4 * (rnd() * 2 - 1);
    let t = Math.round(0.3 * R);
    while (t < n) {
      const len = Math.round((0.4 + 1.2 * rnd()) * R), f0 = 100 + 80 * rnd(), amp = level * (0.3 + 0.7 * rnd());
      for (let i = 0; i < len && t + i < n; i++) {
        const time = i / R, env = Math.sin(Math.PI * i / len) * Math.abs(Math.sin(Math.PI * 3.3 * time)) ** 0.7;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
        x[t + i] += amp * env * (0.7 * v + 0.2 * (rnd() * 2 - 1));
      }
      t += len + Math.round((0.3 + 1.2 * rnd()) * R);
    }
    return x;
  };
  // A source of loud bursts (speech-like) at the given seconds, each `length`
  // long, over a uniform noise floor at `floorDb` dBFS RMS.
  const bursts = (seconds, starts, length, floorDb, seed = 5) => {
    const rnd = TF2Audio.mulberry32(seed), x = new Float32Array(Math.round(seconds * R)), floor = 10 ** (floorDb / 20) * Math.sqrt(3);
    for (let i = 0; i < x.length; i++) x[i] = floor * (rnd() * 2 - 1);
    for (const s of starts) {
      for (let i = 0, at = Math.round(s * R); i < Math.round(length * R) && at + i < x.length; i++) {
        const time = i / R;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * 140 * h * time) / h;
        x[at + i] = 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * time)) * v;
      }
    }
    return x;
  };

  // The gate is the sender's.
  {
    const x = talk(10, 3), seed = 7;
    const r = await render(x, { seed }), want = senderOf(x, { seed }).info.spurts;
    check('the gate is the sender\'s: codecInfo.sender.spurts are createSender\'s on the rounded 24 kHz capture with the render\'s seed',
      JSON.stringify(r.codecInfo.sender.spurts) === JSON.stringify(want) && want.length >= 3 && r.codecInfo.sender.rule === 'steam'
      && r.codecInfo.sender.gate === true && r.codecInfo.sender.meanMin === 327.67 && r.codecInfo.gate === -40
      && r.codecInfo.prerollFrames === 0 && r.codecInfo.holdFrames === 0 && r.codecInfo.spurts === want.length,
      `${want.length} spurts from ${want.map((s) => s.start).join(', ')}`);
  }
  // A typed threshold is the mean a chunk must reach: 32767 x 10^(dB/20).
  {
    const x = talk(10, 3), seed = 7, meanMin = 32767 * 10 ** (-30 / 20);
    const r = await render(x, { seed, gateThresholdDb: -30 }), want = senderOf(x, { seed, meanMin }).info.spurts;
    const asRms = senderOf(x, { seed, meanMin: meanMin * Math.SQRT2 }).info.spurts;
    check('a typed threshold is the mean a chunk must reach: -30 dB gives meanMin 32767 x 10^(-30/20) and createSender\'s spurts with it',
      r.codecInfo.sender.meanMin === meanMin && r.codecInfo.gate === -30 && JSON.stringify(r.codecInfo.sender.spurts) === JSON.stringify(want)
      && JSON.stringify(want) !== JSON.stringify(asRms), `${want.length} spurts from ${want.map((s) => s.start).join(', ')}`);
  }
  // The mean of |x| over a chunk, not a 20 ms frame's RMS.
  {
    const a = new Float32Array(3 * R);
    for (let k = 0; k * 960 + 48 <= a.length; k++) for (let i = 0; i < 48; i++) a[k * 960 + i] = 0.12 * Math.sin(2 * Math.PI * 3000 * i / R);
    const ra = await render(a), frameRms = db(rms(a, 0, 480)), old = await render(a, { codec: 'steam_48' });
    check('mean, not RMS: 2 ms bursts of a 3 kHz sine every 40 ms (20 ms frames at -31 dBFS RMS, every chunk\'s mean about 0.4%, no sample at 15%) send nothing',
      ra.codecInfo.spurts === 0 && peakAbs(ra.samples) === 0 && frameRms > -32 && old.codecInfo.spurts > 0,
      `frame RMS ${frameRms.toFixed(1)} dBFS; steam ${ra.codecInfo.spurts} spurts; the frame gate (steam_48) ${old.codecInfo.spurts}`);
    const b = Float32Array.from({ length: 3 * R }, (_, i) => (Math.floor(i / 60) % 2 ? -344 : 344) / 32768);
    const rb = await render(b);
    check('mean, not RMS: a 200 Hz square wave of height 344 (-39.6 dBFS RMS, a mean of 1.05%) is sent',
      rb.codecInfo.spurts >= 1 && rb.codecInfo.sender.spurts[0].start <= 0 && peakAbs(rb.samples) > 0,
      `RMS ${db(rms(b)).toFixed(2)} dBFS; ${rb.codecInfo.spurts} spurt(s)`);
  }
  // Finding 5's cases, and the peak rule.
  {
    const open = await render(sine(1000, 3, 10 ** (-35.8 / 20))), shut = await render(sine(1000, 3, 10 ** (-40 / 20)));
    const rnd = TF2Audio.mulberry32(42), white = Float32Array.from({ length: 3 * R }, () => rnd() * 2 - 1);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const pink = Float32Array.from(white, (w) => {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      return v;
    });
    const k = 10 ** (-42 / 20) / rms(pink);
    for (let i = 0; i < pink.length; i++) pink[i] *= k;
    const noisy = await render(pink);
    check('finding 5: a 1 kHz sine with a peak of -35.8 dBFS is sent; -40 dBFS is not; pink noise at -42 dBFS RMS is not',
      open.codecInfo.spurts >= 1 && shut.codecInfo.spurts === 0 && noisy.codecInfo.spurts === 0 && peakAbs(shut.samples) === 0 && peakAbs(noisy.samples) === 0,
      `${open.codecInfo.spurts} / ${shut.codecInfo.spurts} / ${noisy.codecInfo.spurts} spurts; pink ${db(rms(pink)).toFixed(1)} dBFS RMS`);
    const click = (level) => { const x = new Float32Array(2 * R); x.fill(level, R, R + 24); return x; };
    const hit = await render(click(0.2)), miss = await render(click(0.1));
    check('the peak rule: 1 ms at 0.2 of full scale in silence is sent; at 0.1 it is not',
      hit.codecInfo.spurts === 1 && miss.codecInfo.spurts === 0, `${hit.codecInfo.spurts} / ${miss.codecInfo.spurts}`);
  }
  // The pre-roll and the hold, seeds 1 to 20: a 1 kHz square wave at 0.5 of
  // full scale (every sample passes the peak rule) from B to E, after 2 s of
  // noise at -50 dBFS.
  {
    const B = 2 * R, E = 3 * R, floor = 10 ** (-50 / 20) * Math.sqrt(3);
    const rnd = TF2Audio.mulberry32(9), x = Float32Array.from({ length: Math.round(4.5 * R) }, () => floor * (rnd() * 2 - 1));
    for (let i = B; i < E; i++) x[i] = Math.floor((i - B) / 12) % 2 ? -0.5 : 0.5;
    const pre = [], hold = [], kept = [];
    for (let seed = 1; seed <= 20; seed++) {
      const s = (await render(x, { seed })).codecInfo.sender.spurts;
      pre.push(B - s[0].start);
      hold.push(s[0].start + 480 * s[0].frames - E);
      kept.push(s[0].preroll);
    }
    // The window alone would pass a longer pre-roll on these seeds (the onset's
    // chunk puts 0 to 750 samples before the burst here), so the spurt's own
    // pre-roll is read too.
    check('the pre-roll: 100 ms and what of the onset\'s chunk lies before the burst (2400 to 4649 samples), seeds 1 to 20',
      pre.every((v) => v >= 2400 && v <= 4649) && kept.every((v) => v === 2400), `${Math.min(...pre)} to ${Math.max(...pre)}; pre-roll ${[...new Set(kept)].join(', ')}`);
    check('the hold: the spurt ends 9,000 to 13,500 samples (375 to 562 ms) after the burst, seeds 1 to 20',
      hold.every((v) => v >= 9000 && v <= 13500), `${Math.min(...hold)} to ${Math.max(...hold)}`);
  }
  // The gate off: a sender setting; the same path after it.
  {
    // The spurt starts at -2400 less the capture's lead (W3-21), read from the sender's info().
    const x = talk(4, 5), r = await render(x, { gate: false }), s = senderOf(x, { gate: false });
    check('the gate off: one spurt from -2400 - lead, sender.gate false, codecInfo.gate null, one resampler call a message that holds samples',
      r.codecInfo.spurts === 1 && r.codecInfo.sender.spurts[0].start === -2400 - s.info.lead && s.info.lead > 0 && r.codecInfo.sender.gate === false
      && r.codecInfo.gate === null && r.codecInfo.resampler.calls === holding(s.msgs) && r.codecInfo.sender.messages === s.msgs.length,
      `${r.codecInfo.resampler.calls} calls, ${s.msgs.length} messages`);
  }
  // 16 bits: the library's own 16-bit decoder.
  const lib = await import(require('url').pathToFileURL(path.join(root, 'vendor/libopus-1.1/index.mjs')).href);
  const encoderOptions = { sampleRate: R, channels: 1, frameSize: 480, application: 2048, signal: 3001, bitrate: 32000, complexity: 9, vbr: true, dtx: true, fec: false };
  {
    const loud = talk(3, 9, 2);
    const h = hooked();
    await render(loud, {}, h);
    const { msgs } = senderOf(loud);
    const sound = h.decoded.filter((d) => d.msg.silence === undefined);
    let enc = null, dec = null, floatDec = null, frames = 0, equal = sound.length === msgs.filter((m) => m.silence === undefined).length, soft = 0, k = 0;
    for (const m of msgs) {
      if (m.silence !== undefined) continue;
      if (!enc) { enc = await lib.createEncoder(encoderOptions); dec = await lib.createDecoder({ sampleRate: R, channels: 1 }); floatDec = await lib.createDecoder({ sampleRate: R, channels: 1 }); }
      const got = sound[k];
      for (let f = 0; f <= m.last - m.first; f++) {
        const packet = enc.encodeFloat(Float32Array.from(m.pcm.subarray(f * 480, (f + 1) * 480), (v) => v / 32768));
        const want = dec.decodeInt16(packet, { frameSize: 480 }), flt = round16(floatDec.decodeFloat(packet, { frameSize: 480 }));
        if (!got || !same(Array.from(got.pcm.subarray(f * 480, (f + 1) * 480)), Array.from(want))) equal = false;
        for (let i = 0; i < 480; i++) if (flt[i] !== want[i]) soft++;
        frames++;
      }
      if (m.end) { enc.free(); dec.free(); floatDec.free(); enc = dec = floatDec = null; }
      k++;
    }
    check('16 bits: the samples handed to the resampler are the module\'s decodeInt16 frame for frame, not clamp-and-round of decodeFloat',
      equal && frames > 100 && soft >= 1, `${frames} frames; ${soft} samples differ from clamp-and-round of decodeFloat`);
  }
  // The same under loss, on a loud source: a decoder per spurt; a gap
  // concealed by the module's decodePacketLossInt16 when the next frame
  // arrives, at most 10 frames of it; a spurt whose first frame is lost
  // concealed from a fresh decoder; frames lost at a spurt's end never played.
  // First gaps of 3 and 12 and the last two frames in the longest spurt, and
  // the first frame of every other spurt; then the gate off and three frames
  // in ten lost, for many concealed frames (their rounding included). Since
  // BC-1 the packet after the gap of 12 (ten concealed in front of what is
  // left of its message) may be refused: that happens after the resampler,
  // so its decoded samples are still handed over (onDecoded) and compared.
  {
    const loud = talk(6, 31, 2);
    const underLoss = async (opts, lose) => {
      const sound = senderOf(loud, opts).msgs.filter((m) => m.silence === undefined), h = hooked();
      await withMask((count) => Uint8Array.from({ length: count }, (_, f) => (lose(f, sound) ? 1 : 0)), () => render(loud, opts, h));
      // A message whose frames were all lost makes no samples and no call.
      const got = new Map(h.decoded.filter((d) => d.msg.silence === undefined).map((d) => [`${d.msg.spurt}:${d.msg.first}`, d.pcm]));
      let enc = null, dec = null, pend = 0, frames = 0, concealed = 0, equal = true, calls = 0;
      for (const m of sound) {
        if (!enc) { enc = await lib.createEncoder(encoderOptions); dec = await lib.createDecoder({ sampleRate: R, channels: 1 }); pend = 0; }
        const blocks = [];
        for (let f = m.first; f <= m.last; f++) {
          const packet = enc.encodeFloat(Float32Array.from(m.pcm.subarray((f - m.first) * 480, (f - m.first + 1) * 480), (v) => v / 32768));
          if (lose(f, sound)) { pend++; continue; }
          for (let c = 0; c < Math.min(pend, 10); c++) { blocks.push(dec.decodePacketLossInt16(480)); concealed++; }
          pend = 0;
          blocks.push(dec.decodeInt16(packet, { frameSize: 480 }));
          frames++;
        }
        const want = new Int16Array(blocks.length * 480), had = got.get(`${m.spurt}:${m.first}`);
        blocks.forEach((b, i) => want.set(b, i * 480));
        if (want.length) calls++;
        if (want.length ? !had || !same(Array.from(had), Array.from(want)) : had !== undefined) equal = false;
        if (m.end) { enc.free(); dec.free(); enc = dec = null; }
      }
      return { equal: equal && calls === got.size, frames, concealed, spurts: new Set(sound.map((m) => m.spurt)).size };
    };
    const spans = (sound) => [...new Set(sound.map((m) => m.spurt))].map((sp) => {
      const own = sound.filter((m) => m.spurt === sp);
      return { first: own[0].first, last: own[own.length - 1].last };
    });
    const shaped = (f, sound) => {
      const all = spans(sound), big = all.reduce((a, b) => (b.last - b.first > a.last - a.first ? b : a));
      return (f >= big.first + 5 && f <= big.first + 7) || (f >= big.first + 12 && f < big.first + 24) || f >= big.last - 1 && f <= big.last
        || all.some((sp) => sp !== big && f === sp.first);
    };
    const a = await underLoss({}, shaped), b = await underLoss({ gate: false }, (f) => (f * 7919) % 10 < 3);
    check('under loss the decoded samples are the module\'s decodeInt16 and decodePacketLossInt16, a fresh decoder each spurt (a spurt\'s lost first frame concealed from it), a gap concealed at the next frame, at most 10, frames lost at a spurt\'s end not played',
      a.equal && b.equal && a.spurts >= 2 && a.concealed === 13 + a.spurts - 1 && b.concealed >= 80,
      `${a.spurts} spurts: ${a.frames} frames decoded, ${a.concealed} concealed${a.equal ? '' : ', NOT the module\'s'}; the gate off, 3 in 10 lost: ${b.frames} decoded, ${b.concealed} concealed${b.equal ? '' : ', NOT the module\'s'}`);
  }
  // A late frame: 480 zeros and no gap. One long spurt (the gate off). (The
  // cap of ten and where concealed frames lie are BC-1's own time, [5d].)
  {
    const x = talk(8, 13, 0.3);
    const lossAt = (from, n, code = 1) => (count) => Uint8Array.from({ length: count }, (_, f) => (f >= from && f < from + n ? code : 0));
    const h = hooked(), late = await withMask(lossAt(150, 1, 2), () => render(x, { gate: false }, h));
    const d = h.decoded.find((e) => e.msg.first <= 150 && e.msg.last >= 150), j = 150 - d.msg.first;
    const total = (hh) => hh.decoded.reduce((n, e) => n + e.pcm.length, 0), hp = hooked();
    await render(x, { gate: false }, hp);
    check('a late frame: 480 zeros at its place in the decoded samples, and nothing concealed',
      d.pcm.length === 480 * (d.msg.last - d.msg.first + 1) && d.pcm.subarray(480 * j, 480 * (j + 1)).every((v) => v === 0)
      && total(h) === total(hp) && late.codecInfo.underrunFrames === 1 && late.codecInfo.lostFrames === 0,
      `block ${j} of the message from frame ${d.msg.first}`);
  }
  // Once per message, and one resampler for the render.
  {
    const x = talk(10, 11), s = senderOf(x), r = await render(x);
    check('once per message: one resampler call for each message that holds samples (silence records among them)',
      r.codecInfo.resampler.calls === holding(s.msgs) && s.msgs.some((m) => m.silence !== undefined) && r.codecInfo.resampler.kernel === Swr.DEFAULT_KERNEL,
      `${r.codecInfo.resampler.calls} calls, ${s.msgs.length} messages`);
    // 2400 + lead + the source a whole number of frames (W3-21: seed 0xC0FFEE's lead is 49, so
    // 95,951 samples; 96,000 with no lead).
    const exact = talk(4, 17).subarray(0, 96000 - Sender.createClock({ seed: 0xC0FFEE }).lead), g = senderOf(exact, { seed: 0xC0FFEE, gate: false }), last = g.msgs[g.msgs.length - 1];
    const rg = await render(exact, { seed: 0xC0FFEE, gate: false });
    check('once per message: the gate off, 96,000 samples less the lead (95,951) and seed 0xC0FFEE end on an empty end message, which makes no call',
      last.end && last.last === last.first - 1 && last.pcm.length === 0 && rg.codecInfo.resampler.calls === g.msgs.length - 1,
      `${rg.codecInfo.resampler.calls} calls, ${g.msgs.length} messages`);
    const three = bursts(8, [0.5, 3, 5.5], 1, -60), h = hooked();
    const r3 = await render(three, {}, h);
    const one = Swr.createResampler(), reset = Swr.createResampler();
    let match = true, resetMatch = true;
    h.decoded.forEach((e, k) => {
      if (!same(Array.from(one.packet(e.pcm)), Array.from(h.resampled[k].y))) match = false;
      if (!same(Array.from(reset.packet(e.pcm)), Array.from(h.resampled[k].y))) resetMatch = false;
      if (e.msg.end) reset.reset();
    });
    check('one resampler, never reset: its outputs are one createResampler() fed the decoded arrays in order; with a reset at each end marker they are not',
      r3.codecInfo.spurts === 3 && match && !resetMatch && h.decoded.length === h.resampled.length, `${h.resampled.length} packets in ${r3.codecInfo.spurts} spurts`);
    // A silence record is exactly its count of zeros (msg.silence), and the
    // resampler makes of it, in its place, what it makes of that many zeros.
    const own = Swr.createResampler();
    let records = 0, zeros = true;
    h.decoded.forEach((e, k) => {
      const record = e.msg.silence !== undefined, y = own.packet(record ? new Int16Array(e.msg.silence) : e.pcm);
      if (!record) return;
      records++;
      if (e.pcm.length !== e.msg.silence || e.pcm.some((v) => v !== 0) || !same(Array.from(y), Array.from(h.resampled[k].y))) zeros = false;
    });
    check('a silence record is exactly its count of zeros, and the resampler gives for it what it gives for that many zeros in its place',
      zeros && records >= 2, `${records} records of ${h.decoded.filter((e) => e.msg.silence !== undefined).map((e) => e.msg.silence).join(', ')} samples`);
  }
  // The gain is fed the decoded packets and nothing else, in the sender's
  // order: the silence records' zeros among them; a late frame's samples not.
  {
    const second = 3.3, x = bursts(6, [0.5, second], 0.8, -50), L = 156;   // 2 s apart
    const relay = (h, settings, lateMode = 'out') => {
      const gain = TF2Audio.createGain(settings), out = new Float32Array(h.gained.length), states = [];
      let spurt = null, cursor = 0;
      for (const { y, msg } of h.resampled) {
        let g = Float32Array.from(y, (v) => v / 32768);
        const F = msg.silence !== undefined ? 0 : msg.last - msg.first + 1, n = g.length;
        const lateFrames = (msg.lateBlocks || []);
        if (lateMode === 'out' && lateFrames.length) {
          for (let j = 0; j < F;) {
            if (lateFrames.includes(j)) { j++; continue; }
            let k = j;
            while (k < F && !lateFrames.includes(k)) k++;
            const a = Math.round(j * n / F), b = Math.round(k * n / F);
            g.set(gain.process(g.subarray(a, b)), a);
            j = k;
          }
        } else g = gain.process(g);
        states.push({ silence: msg.silence !== undefined, ...gain.state() });
        if (msg.silence !== undefined) continue;
        if (msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * VR / R); }
        for (let i = 0; i < n; i++) if (cursor + i >= 0 && cursor + i < out.length) out[cursor + i] = g[i];
        cursor += n;
      }
      return { out, states };
    };
    const settings = { avgGain: 0.5, maxGain: 10, scale: 1 }, h = hooked(), r = await render(x, {}, h);
    const mine = relay(h, settings), silence = mine.states.find((s) => s.silence);
    check('the gain is fed the decoded packets: the render\'s gain output is a fresh createGain fed every resampled packet in order (the silence record\'s included), laid as the render lays them',
      r.codecInfo.spurts === 2 && same(Array.from(mine.out), Array.from(h.gained)) && h.resampled.some((e) => e.msg.silence !== undefined),
      `${h.resampled.length} packets`);
    check('a silence record\'s samples are decoded zeros: they send the gain to its cap', silence && silence.current === 10 && silence.next === 10,
      silence ? `after the record: current ${silence.current}, next ${silence.next}` : 'no record');
    // Main's rule: receiverAutoGain with W3-05's decoded() over the same laid
    // signal, its blocks on the source's grid and a block not decoded held.
    const raw = new Float32Array(h.gained.length);
    { let spurt = null, cursor = 0;
      for (const { y, msg } of h.resampled) {
        if (msg.silence !== undefined) continue;
        if (msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * VR / R); }
        for (let i = 0; i < y.length; i++) if (cursor + i >= 0 && cursor + i < raw.length) raw[cursor + i] = y[i] / 32768;
        cursor += y.length;
      } }
    const old = TF2Audio.receiverAutoGain(raw, { ...settings, decoded: TF2Audio.decodedFromFrames(r.codecInfo.frameLog, 480, L, R, VR) });
    // The burst's onset where its decoded sound arrives on the timeline: a
    // decoded sample is laid where its source sample is (times 147/80), and
    // after the first packet the resampler is 16 inputs (29 outputs) late.
    let onset = Math.round(second * VR) - 200;
    while (Math.abs(raw[onset]) < 0.02) onset++;
    let first = -1;
    for (let i = onset; i < onset + 128; i++) if (old[i] !== h.gained[i]) { first = i - onset; break; }
    check('the gain\'s blocks run over the decoded samples, not the source\'s grid: it differs from main\'s rule in the first 128 samples of the second burst',
      first >= 0, `first difference ${first} samples after the onset, ${onset - Math.round(second * VR)} after the source's`);
    // One late frame inside the second burst: its samples are left out of
    // what the gain is given (and laid as they are), not fed to it.
    const frame = r.codecInfo.sender.spurts[1].frames > 30 ? (() => { const m = h.decoded.find((e) => e.msg.spurt === 1); return m.msg.first + 20; })() : -1;
    const hl = hooked();
    await withMask((count) => Uint8Array.from({ length: count }, (_, f) => (f === frame ? 2 : 0)), () => render(x, {}, hl));
    for (const e of hl.resampled) if (e.msg.first <= frame && e.msg.last >= frame) e.msg.lateBlocks = [frame - e.msg.first];
    const left = relay(hl, settings, 'out'), fed = relay(hl, settings, 'in');
    // A late frame's span, frame j of F in a packet of n samples, is
    // round(j n / F) to round((j + 1) n / F). Every sound packet is 480 F
    // samples and the resampler (147/80) gives exactly 882 F for it, its
    // first packet included, so j n / F is a whole number and the rounding
    // never acts: what is pinned is that premise.
    const exact = h.resampled.filter((e) => e.msg.silence === undefined).every((e) => e.y.length === 882 * (e.msg.last - e.msg.first + 1));
    check('a late frame\'s samples are not decoded: the gain after its packet is the gain with them left out, not with them fed (every packet 882 samples a frame, so the span is exact)',
      frame > 0 && exact && same(Array.from(left.out), Array.from(hl.gained)) && !same(Array.from(fed.out), Array.from(hl.gained)), `frame ${frame}`);
  }
  // Laying (point 8) and the slots (point 9). On this source two spurts meet
  // (the gate closes and opens again, its pre-roll over the last one's end),
  // and some anchors round up. The gain off: what is laid is what reaches onGain.
  // The seed is 10 since W3-16's clock (it was 1, where two spurts no longer meet).
  {
    const x = talk(12, 11), h = hooked(), r = await render(x, { seed: 10, agc: false, voiceScale: 1 }, h), L = r.codecInfo.lookahead;
    const want = new Float32Array(h.gained.length);
    let spurt = null, cursor = 0, twice = 0, up = 0;
    for (const { y, msg } of h.resampled) {
      if (msg.silence !== undefined) continue;
      if (msg.spurt !== spurt) {
        spurt = msg.spurt;
        const a = (msg.start - L) * VR / R, anchor = Math.round(a);
        if (anchor > a) up++;
        twice += Math.max(0, cursor - anchor);
        cursor = anchor;
      }
      for (let i = 0; i < y.length; i++) if (cursor + i >= 0 && cursor + i < want.length) want[cursor + i] = y[i] / 32768;
      cursor += y.length;
    }
    check('laying: a spurt\'s first packet at round((start - lookahead) x 147/80), each later one after it, the later packet winning where two spurts meet',
      same(Array.from(want), Array.from(h.gained)) && twice > 0 && up > 0, `${r.codecInfo.spurts} spurts; ${twice} samples laid twice; ${up} anchors rounded up`);
    const n = r.codecInfo.frameLog.length, spurts = r.codecInfo.sender.spurts;
    const covered = (p) => Array.from({ length: n }, (_, i) => (spurts.some((s) => 480 * i + p >= s.start && 480 * i + p < s.start + 480 * s.frames) ? 1 : 0));
    check('slots: a 20 ms slot of the source holds a frame where a spurt\'s laid frames cover its centre, not its start',
      n === Math.ceil((x.length + L) / 480) && same(Array.from(r.codecInfo.frameLog, (c) => (c ? 1 : 0)), covered(240)) && !same(covered(240), covered(0)),
      `${n} slots, ${covered(240).reduce((t, v) => t + v, 0)} holding a frame`);
  }
  // Re-timing (opts.retime) on the steam path moves a spurt's laid samples
  // whole: the moved spurt equals the unmoved one sample for sample, nothing
  // is left between where it now ends and where it ended, it lands no earlier
  // than the spurt before ends, and the rest of the render is as it was. Six
  // bursts 0.8 s apart; at seeds 18 and 21 a move would otherwise reach into
  // the spurt before.
  {
    const x = bursts(10, [0.5, 2.1, 3.7, 5.3, 6.9, 8.5], 0.8, -50);
    let moves = 0, whole = 0, clear = 0, apart = 0, rest = 0;
    for (const seed of [1, 2, 3, 4, 18, 21]) {
      const h0 = hooked(), h1 = hooked();
      const r0 = await render(x, { seed }, h0), r1 = await render(x, { seed, retime: true }, h1);
      const L = r0.codecInfo.lookahead, N = h0.gained.length, spans = [];
      let spurt = null, cursor = 0;
      for (const { y, msg } of h0.resampled) {
        if (msg.silence !== undefined) continue;
        if (msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * VR / R); spans.push([cursor, cursor]); }
        cursor += y.length;
        spans[spans.length - 1][1] = cursor;
      }
      const merged = [];
      for (const [p, q] of spans) {
        const a = Math.max(0, p), b = Math.min(N, q);
        if (b <= a) continue;
        if (merged.length && a <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(b, merged[merged.length - 1][1]);
        else merged.push([a, b]);
      }
      const want = Float32Array.from(h0.gained);
      for (const m of r1.codecInfo.retimed) {
        moves++;
        const shift = Math.round(m.shiftMs * VR / 1000), from = Math.round(m.time * VR), span = merged.find(([a]) => a === from);
        if (!span) continue;
        const to = span[1];
        if (same(Array.from(h1.gained.subarray(from - shift, to - shift)), Array.from(h0.gained.subarray(from, to)))) whole++;
        if (h1.gained.subarray(to - shift, to).every((v) => v === 0)) clear++;
        const k = merged.indexOf(span);
        if (from - shift >= (k > 0 ? merged[k - 1][1] : 0)) apart++;
        want.copyWithin(from - shift, from, to);
        want.fill(0, Math.max(from - shift, to - shift), to);
      }
      if (same(Array.from(want), Array.from(h1.gained))) rest++;
    }
    check('re-timing on the steam path moves a spurt\'s laid samples whole: the moved spurt equals the unmoved one, nothing is left at its old place, it lands after the spurt before, the rest is as it was',
      moves >= 6 && whole === moves && clear === moves && apart === moves && rest === 6,
      `${moves} moves; ${whole} whole, ${clear} leaving nothing behind, ${apart} after the spurt before; ${rest} of 6 renders otherwise as they were`);
  }
  // steamUptime (W3-16): how long the sender's Steam had run, passed to the
  // sender as its uptime, unclamped. 1 s of loud tone then 2 s of silence: at
  // 4 hours the last chunk is read at most 0.466 s after the last active one,
  // at 36 days at least 0.5 s after it, so the spurt is longer.
  {
    const x = new Float32Array(3 * R);
    x.set(sine(440, 1, 0.5));
    const base = await render(x, { seed: 2 }), today = await render(x, { seed: 2, steamUptime: 14400 }), month = await render(x, { seed: 2, steamUptime: 3110400 });
    const nul = await render(x, { seed: 2, steamUptime: null }), week = await render(x, { seed: 2, steamUptime: 777600 });
    check('steamUptime: codecInfo.sender.uptime is the value the sender ran with (777600 when none is passed, or null); the default render is the 777600 one',
      base.codecInfo.sender.uptime === 777600 && nul.codecInfo.sender.uptime === 777600 && today.codecInfo.sender.uptime === 14400
      && month.codecInfo.sender.uptime === 3110400 && same(Array.from(base.samples), Array.from(week.samples)) && same(Array.from(base.samples), Array.from(nul.samples)));
    const a = today.codecInfo.sender.spurts[0], b = month.codecInfo.sender.spurts[0];
    check('steamUptime: 1 s of tone then 2 s of silence, the same seed: the spurt is longer at "about a month" (3110400) than at "since today" (14400), from the same start',
      a.start === b.start && b.frames > a.frames && today.codecInfo.sender.chunks === month.codecInfo.sender.chunks, `${a.frames} and ${b.frames} frames from ${a.start}`);
    let refused = 0;
    for (const v of [-1, 4000001, NaN, Infinity, '7']) {
      try { await render(x.subarray(0, R), { steamUptime: v }); } catch (e) { if (e.name === 'RangeError' && /uptime/.test(e.message)) refused++; }
    }
    check('steamUptime: a value that is not a finite number from 0 to 4,000,000 is the sender\'s RangeError, not clamped (-1, 4000001, NaN, Infinity, \'7\')', refused === 5, `${refused} of 5`);
    const stream = await TF2Audio.createRender({ sampleRate: R, length: x.length, numberOfChannels: 1 }, { codec: 'steam', volume: 1, seed: 2, steamUptime: 3110400 });
    const parts = [await stream.push(x.subarray(0, 30000)), await stream.push(x.subarray(30000))];
    const end = await stream.finish();
    const streamed = Float32Array.from([...parts[0], ...parts[1], ...end.samples]);
    check('steamUptime: the stream gives the offline render\'s samples and codecInfo.sender', same(Array.from(streamed), Array.from(month.samples))
      && JSON.stringify(end.codecInfo.sender) === JSON.stringify(month.codecInfo.sender));
  }
  // The seed, the resampler's kernel, the complexity.
  {
    const x = talk(6, 21), a = await render(x, { seed: 3 }), b = await render(x, { seed: 3 }), c = await render(x, { seed: 4 });
    check('the same seed gives the same samples; another moves a spurt\'s start or the messages',
      same(Array.from(a.samples), Array.from(b.samples)) && (JSON.stringify(a.codecInfo.sender.spurts) !== JSON.stringify(c.codecInfo.sender.spurts)
        || a.codecInfo.sender.messages !== c.codecInfo.sender.messages || !same(Array.from(a.samples), Array.from(c.samples))),
      `${JSON.stringify(a.codecInfo.sender.spurts.map((s) => s.start))} / ${JSON.stringify(c.codecInfo.sender.spurts.map((s) => s.start))}`);
    const loud = talk(4, 23, 1.2), hf = hooked(), hc = hooked();
    await render(loud, {}, hf);
    await render(loud, { swrKernel: 'c' }, hc);
    let n = 0, differ = 0;
    hf.resampled.forEach((e, k) => { n += e.y.length; for (let i = 0; i < e.y.length; i++) if (e.y[i] !== hc.resampled[k].y[i]) differ++; });
    check('swrKernel \'c\' on a loud source changes at least one of the resampler\'s output samples and at most 1 in 500',
      peakAbs(loud) > 0.5 && differ >= 1 && differ <= n / 500, `${differ} of ${n}`);
    const signals = [talk(4, 25), loud, bursts(4, [0.5], 2, -50)];
    let identical = true, frames = 0;
    for (const sig of signals) {
      const q = Float32Array.from(captured(sig), (v) => v / 32768), hashes = [];
      for (const complexity of [9, 10]) {
        const packets = [];
        await opus.roundTrip(q, R, 32000, { runtime: '1.1.5', application: 'voip', signal: 'voice', complexity, vbr: true, dtx: true, onPacket: (f, p) => packets.push(Array.from(p).join()) });
        hashes.push(packets.join('|'));
        frames += packets.length / 2;
      }
      if (hashes[0] !== hashes[1]) identical = false;
    }
    check('complexity 9 (Steam sets none: the library\'s default) and 10 give identical packets on these signals',
      identical && steam.encoder.complexity === 9, `${frames} frames`);
  }
  await steamLossTests({ R, VR, Swr, lib, encoderOptions, senderOf, hooked, render, withMask, same, talk, bursts });
}

/* [5d] BC-1 (docs/work-orders/BC-1-loss-per-message.md): on `steam` loss takes
 * whole messages. The reference is the order's rules A to E driven from a dry
 * run of the sender, the vendored codec, the resampler module and a fresh
 * gain, never from the render's own steam path. */
async function steamLossTests({ R, VR, Swr, lib, encoderOptions, senderOf, hooked, render, withMask, same, talk, bursts }) {
  console.log('\n[5d] Loss takes whole messages: the steam render (BC-1)');
  const ROOM = 22528 / 2, SLOT = 882;
  const size = (m) => (m.silence !== undefined ? 0 : m.last - m.first + 1);
  const freshDecoder = () => lib.createDecoder({ sampleRate: R, channels: 1 });
  // Rule A as the order writes it: u < p, u from mulberry32((seed ^ 0x4C4F5353) >>> 0).
  const drawsOf = (lossPct, seed) => {
    const u = TF2Audio.mulberry32(((seed >>> 0) ^ 0x4C4F5353) >>> 0), p = lossPct / 100;
    return () => u() < p;
  };
  // Rules B to E, no jitter. lose(k, m) once per message in order. Returns the
  // messages that reach the resampler (arrivals: the 16-bit samples, the
  // frames their blocks stand for, the blocks concealed, the resampled packet,
  // where it is laid, whether it is refused), the signal at the mix point
  // (the gain on, laid at anchor + 882 x (first block's frame - spurt's first
  // frame), later packets winning) and the counts. variant.skipRefused keeps
  // a refused packet from the resampler; variant.resetEachSpurt gives each
  // spurt a fresh decoder (the rule before BC-1).
  const reference = async (x, opts, lose, variant = {}) => {
    const { msgs, info } = senderOf(x, { seed: opts.seed ?? 0xC0FFEE, ...(opts.gate === false ? { gate: false } : {}) });
    const N = Math.round(x.length * VR / R), laid = new Float32Array(N);
    const swr = Swr.createResampler(), gain = TF2Audio.createGain({ avgGain: 0.5, maxGain: 10, scale: 1 });
    const arrivals = [], lost = new Set();
    let enc = null, dec = null, next = 0, spurt = null, first = 0, anchor = 0, pending = [], L = null, refused = 0;
    for (let k = 0; k < msgs.length; k++) {
      const m = msgs[k], gone = !!lose(k, m);
      if (gone) lost.add(k);
      let pcm = null, frames = [], concealed = 0;
      if (m.silence !== undefined) { if (!gone) pcm = new Int16Array(m.silence); }
      else {
        if (m.spurt !== spurt) {
          if (enc) enc.free();
          enc = await lib.createEncoder(encoderOptions);
          if (L === null) L = enc.getLookahead();
          if (!dec || variant.resetEachSpurt) { if (dec) dec.free(); dec = await freshDecoder(); next = 0; }
          spurt = m.spurt; first = m.first; pending = [];
          anchor = Math.round((m.start - L) * VR / R);
        }
        const parts = [];
        for (let f = m.first; f <= m.last; f++) {
          const packet = enc.encodeFloat(Float32Array.from(m.pcm.subarray((f - m.first) * 480, (f - m.first + 1) * 480), (v) => v / 32768));
          if (gone) { pending.push(f); continue; }
          const seq = f - first;
          let conceal = 0;
          if (seq < next) { dec.free(); dec = await freshDecoder(); }
          else conceal = Math.min(seq - next, 10);
          for (const g of pending.slice(pending.length - conceal)) { parts.push(dec.decodePacketLossInt16(480)); frames.push(g); concealed++; }
          pending = [];
          parts.push(dec.decodeInt16(packet, { frameSize: 480 }));
          frames.push(f);
          next = seq + 1;
        }
        if (m.end) {
          enc.free(); enc = null;
          if (!gone) { dec.free(); dec = await freshDecoder(); next = 0; pending = []; }
        }
        if (parts.length) { pcm = new Int16Array(parts.length * 480); parts.forEach((p, i) => pcm.set(p, i * 480)); }
      }
      if (!pcm) continue;
      const fits = pcm.length / 480 * SLOT <= ROOM || m.silence !== undefined;
      const y = !fits && variant.skipRefused ? new Int16Array(0) : swr.packet(pcm);
      const a = { k, msg: m, pcm, y, frames, concealed, at: m.silence !== undefined ? null : anchor + SLOT * (frames[0] - first), refused: y.length > ROOM || !fits };
      arrivals.push(a);
      if (a.refused) { refused++; continue; }
      const g = gain.process(Float32Array.from(y, (v) => v / 32768));
      if (a.at !== null) for (let i = 0; i < g.length; i++) if (a.at + i >= 0 && a.at + i < N) laid[a.at + i] = g[i];
    }
    if (enc) enc.free();
    if (dec) dec.free();
    return { msgs, info, arrivals, laid, lost, lookahead: L, network: { messages: msgs.length, lostMessages: lost.size, refusedMessages: refused } };
  };
  // The render's hooks against the reference: the messages that reached the
  // resampler and their samples (onDecoded), its packets (onResampled), the
  // signal at the mix point (onGain).
  const matches = (h, ref) => {
    const want = ref.arrivals, id = (m) => (m.silence !== undefined ? `s${m.silence}` : `${m.spurt}:${m.first}`);
    return {
      decoded: h.decoded.length === want.length && h.decoded.every((d, i) => id(d.msg) === id(want[i].msg) && same(Array.from(d.pcm), Array.from(want[i].pcm))),
      resampled: h.resampled.length === want.length && h.resampled.every((e, i) => same(Array.from(e.y), Array.from(want[i].y))),
      laid: h.gained.length === ref.laid.length && same(Array.from(h.gained), Array.from(ref.laid))
    };
  };
  const ok3 = (m) => m.decoded && m.resampled && m.laid;
  const says = (m) => `decoded ${m.decoded}, resampled ${m.resampled}, laid ${m.laid}`;
  const records = [];   // every record's frames over the loss renders (test 11)

  // Test 2. The draw: one per message, alone (no bursts), its own random
  // stream; raising the setting only adds lost messages.
  {
    const rows = [];
    let ok = true;
    for (const pct of [5, 21.7, 37, 49.8]) {
      const d = TF2Audio.steamMessageLoss(pct, 7), spec = drawsOf(pct, 7), runs = [];
      let lostCount = 0, run = 0, equal = true;
      for (let i = 0; i < 20000; i++) {
        const v = d();
        if (v !== spec()) equal = false;
        if (v) { lostCount++; run++; } else if (run) { runs.push(run); run = 0; }
      }
      const share = lostCount / 20000, mean = runs.reduce((a, b) => a + b, 0) / runs.length, want = 1 / (1 - pct / 100);
      if (!equal || Math.abs(share - pct / 100) > 0.01 || Math.abs(mean / want - 1) > 0.05) ok = false;
      rows.push(`${pct}%: ${(100 * share).toFixed(2)}% lost, runs ${mean.toFixed(3)} (1/(1-p) ${want.toFixed(3)})${equal ? '' : ', NOT the order\'s draw'}`);
    }
    check('the draw: over 20,000 messages at 5, 21.7, 37 and 49.8% the lost share is within a point, runs of lost messages average 1/(1 - p) within 5% (no bursts), and each draw is u < p from mulberry32((seed ^ 0x4C4F5353) >>> 0)',
      ok, rows.join('; '));
    const d10 = TF2Audio.steamMessageLoss(10, 3), d30 = TF2Audio.steamMessageLoss(30, 3);
    let nested = true, at10 = 0;
    for (let i = 0; i < 20000; i++) { const a = d10(), b = d30(); if (a) at10++; if (a && !b) nested = false; }
    check('the draw: raising the setting only adds lost messages (every message lost at 10% is lost at 30%, same seed)', nested && at10 > 1500, `${at10} lost at 10%`);
    // In a render: which messages the steam path is told are lost.
    const lostBy = async (x, opts) => {
      const real = engine.codec, seen = [];
      engine.codec = { ...real, steamRoundTrip: (m, b, o) => real.steamRoundTrip(m, b, { ...o, lose: (k, msg) => { const v = o.lose(k, msg); if (v) seen.push(k); return v; } }) };
      try { await render(x, opts); } finally { engine.codec = real; }
      return seen.join();
    };
    const x = talk(10, 41), base = { seed: 5, lossPct: 30 };
    const plain = await lostBy(x, base), jit = await lostBy(x, { ...base, jitterMs: 50 }), split = await lostBy(x, { ...base, frameMs: 80 });
    const other = await lostBy(x, { ...base, seed: 6 });
    check('the draw in a render: the same messages are lost at jitter 0 and 50 ms and at net_split 20 and 80 ms; another seed loses others',
      plain.length > 0 && plain === jit && plain === split && other !== plain, `seed 5: messages ${plain.split(',').slice(0, 12).join(', ')}, ...`);
  }

  // Tests 1, 11 and 12. Whole messages under the draw: a dry run of the
  // sender with the same seed and the draw says which messages reach the
  // resampler and how many blocks are concealed in front of each.
  {
    const x = talk(20, 3), rows = [];
    let ok = true, ruleOk = true, arrivalsChecked = 0, carried = 0;
    for (const lossPct of [21.7, 37, 49.8]) for (const seed of [1, 2, 3]) {
      const h = hooked(), r = await render(x, { seed, lossPct }, h);
      const d = drawsOf(lossPct, seed), ref = await reference(x, { seed }, () => d()), m = matches(h, ref);
      // The frames of the messages lost since the last arrival in that spurt,
      // ten at most; a spurt's first arrival on a decoder carried over a lost
      // end marker follows rule C instead (test 5).
      let since = 0, spurt = null, markerLost = false, firstInSpurt = true, ai = 0;
      for (let k = 0; k < ref.msgs.length; k++) {
        const msg = ref.msgs[k];
        if (msg.silence !== undefined) { if (!ref.lost.has(k)) ai++; continue; }
        if (msg.spurt !== spurt) { spurt = msg.spurt; since = 0; firstInSpurt = true; }
        if (ref.lost.has(k)) { since += size(msg); if (msg.end) markerLost = true; continue; }
        if (size(msg)) {
          const a = ref.arrivals[ai++];
          if (firstInSpurt && markerLost) carried++;
          else { arrivalsChecked++; if (a.concealed !== Math.min(10, since)) ruleOk = false; }
          since = 0; firstInSpurt = false;
        }
        if (msg.end) markerLost = false;
      }
      for (const e of h.decoded) records.push(e.pcm.length / 480);
      const net = r.codecInfo.network;
      const counts = !!net && net.messages === ref.network.messages && net.lostMessages === ref.network.lostMessages && net.refusedMessages === ref.network.refusedMessages;
      if (!ok3(m) || !counts) ok = false;
      rows.push(`${lossPct}%/${seed}: ${ref.network.lostMessages} of ${ref.network.messages} lost, ${ref.network.refusedMessages} refused${ok3(m) ? '' : ` (${says(m)})`}${counts ? '' : ` (codecInfo.network ${JSON.stringify(net)})`}`);
    }
    check('whole messages (21.7, 37 and 49.8%, seeds 1 to 3): the messages that reach the resampler, their samples, the resampler\'s packets and the laid signal are the reference\'s, and codecInfo.network is its counts',
      ok, rows.join('; '));
    check('whole messages: in front of each arrival, the frames of the messages lost since the last arrival in that spurt, ten at most, are concealed (a spurt\'s first arrival after a lost end marker aside: rule C)',
      ruleOk && arrivalsChecked > 500, `${arrivalsChecked} arrivals checked, ${carried} after a lost end marker`);
    const plain = await render(x, { seed: 1 }), none = await render(x, { seed: 1, loseMessage: () => false });
    check('codecInfo.network is absent at loss 0, and present with nothing lost when loseMessage is given and loses nothing',
      !('network' in plain.codecInfo) && none.codecInfo.network && none.codecInfo.network.lostMessages === 0
      && none.codecInfo.network.refusedMessages === 0 && none.codecInfo.network.messages === plain.codecInfo.sender.messages
      && same(Array.from(none.samples), Array.from(plain.samples)), JSON.stringify(none.codecInfo.network));
  }

  // Test 3. k frames lost give k concealed, by loseMessage, on one long spurt
  // (the gate off): one lost message of each size the signal offers; two and
  // three in a row coming to 7 to 10 frames; more than ten give exactly ten.
  {
    const x = talk(16, 13, 0.3), opts = { gate: false, seed: 4 };
    const { msgs } = senderOf(x, opts);
    const lose = new Set(), cases = [];
    const sizes = [...new Set(msgs.slice(1, -1).map(size))].sort();
    let k = 2;
    // Takes a window of n messages from k on (n = 0: as many as reach 11
    // frames) that ends before a message of at most `room` frames.
    const take = (n, test, room) => {
      for (let i = k; i + n + 2 < msgs.length; i++) {
        let j = i, frames = 0;
        if (n) { for (; j < i + n; j++) frames += size(msgs[j]); }
        else { while (frames < 11 && j < msgs.length - 2) frames += size(msgs[j++]); }
        if (!test(frames) || size(msgs[j]) < 1 || size(msgs[j]) > room(frames)) continue;
        for (let q = i; q < j; q++) lose.add(q);
        cases.push({ from: i, to: j, frames, next: j });
        k = j + 2;
        return true;
      }
      return false;
    };
    let found = true;
    for (const s of sizes) found = take(1, (f) => f === s, (f) => 12 - f) && found;
    found = take(2, (f) => f >= 7 && f <= 10, (f) => 12 - f) && found;
    found = take(3, (f) => f >= 7 && f <= 10, (f) => 12 - f) && found;
    found = take(0, (f) => f > 10, () => 2) && found;
    const h = hooked(), r = await render(x, { ...opts, loseMessage: (i) => lose.has(i) }, h);
    const ref = await reference(x, opts, (i) => lose.has(i)), m = matches(h, ref);
    const got = cases.map((c) => {
      const d = h.decoded.find((e) => e.msg.first === msgs[c.next].first);
      return d ? d.pcm.length / 480 - size(msgs[c.next]) : -1;
    });
    const want = cases.map((c) => Math.min(10, c.frames));
    for (const e of h.decoded) records.push(e.pcm.length / 480);
    check(`k frames lost give k concealed: one lost message of each size the signal offers (${sizes.join(', ')}), two and three in a row of 7 to 10 frames, more than ten give exactly ten; the decoded samples are the reference's`,
      found && sizes.length >= 4 && same(got, want) && want[want.length - 1] === 10 && cases[cases.length - 1].frames > 10 && ok3(m)
      && r.codecInfo.network.refusedMessages === 0,
      `lost ${cases.map((c) => c.frames).join(', ')} frames: concealed ${got.join(', ')}${ok3(m) ? '' : `; ${says(m)}`}`);
  }
  // A spurt's last messages lost give nothing after the last arrival; a lost
  // opening is concealed from a decoder that has decoded nothing.
  const xb = bursts(8, [0.5, 3, 5.5], 1, -60), ob = { seed: 2 };
  const mb = senderOf(xb, ob).msgs;
  const own = (sp) => mb.map((m, i) => [m, i]).filter(([m]) => m.silence === undefined && m.spurt === sp).map(([, i]) => i);
  {
    const s0 = own(0), last2 = new Set(s0.slice(-2)), lostFrames = s0.slice(-2).reduce((n, i) => n + size(mb[i]), 0);
    const h0 = hooked(), plain = await render(xb, ob, h0), h = hooked(), r = await render(xb, { ...ob, loseMessage: (i) => last2.has(i) }, h);
    const ref = await reference(xb, ob, (i) => last2.has(i)), m = matches(h, ref);
    const filled = (info) => Array.from(info.frameLog).filter((c) => c !== 0).length;
    const opening1 = h.decoded.find((e) => e.msg.spurt === 1);
    check('a spurt\'s last messages lost (its end marker\'s among them): nothing is concealed after the last arrival, their frames\' slots stay empty, and the next spurt\'s opening conceals nothing',
      mb[s0[s0.length - 1]].end && r.codecInfo.lostFrames === 0 && filled(plain.codecInfo) - filled(r.codecInfo) === lostFrames && lostFrames > 0
      && opening1 && opening1.pcm.length === 480 * size(mb[own(1)[0]]) && ok3(m), `${lostFrames} frames lost at the end of spurt 0${ok3(m) ? '' : `; ${says(m)}`}`);
  }
  {
    const open0 = own(0)[0], h = hooked(), r = await render(xb, { ...ob, loseMessage: (i) => i === open0 }, h);
    const ref = await reference(xb, ob, (i) => i === open0), m = matches(h, ref), a = ref.arrivals[0];
    const head = h.decoded[0].pcm.subarray(0, 480 * a.concealed);
    check('a lost opening: the next message conceals its frames (ten at most) from a decoder that has decoded nothing, which gives zeros; the samples are the reference\'s',
      a.concealed === Math.min(10, size(mb[open0])) && a.concealed > 0 && head.length === 480 * a.concealed && head.every((v) => v === 0) && ok3(m),
      `the opening's ${size(mb[open0])} frames lost; ${a.concealed} concealed blocks of zeros${a.refused ? ' (the packet is refused: too long)' : ''}${ok3(m) ? '' : `; ${says(m)}`}; ${r.codecInfo.network.refusedMessages} refused`);
  }

  // Test 4. The refusal: a packet of more than 11,264 samples (12 frames) is
  // taken by nothing after the resampler.
  {
    check('the limit: steamFits takes 11,264 samples and not 11,265', TF2Audio.steamFits(11264) === true && TF2Audio.steamFits(11265) === false
      && TF2Audio.steamFits(10584) === true && TF2Audio.steamFits(11466) === false);
    const x = talk(16, 13, 0.3);
    // A run of messages of exactly `gap` frames before a message of `n`, on
    // the first sender seed that has one (the gate off).
    const find = (gap, n) => {
      for (let seed = 1; seed <= 40; seed++) {
        const { msgs } = senderOf(x, { gate: false, seed });
        for (let i = 2; i + 1 < msgs.length - 2; i++) {
          let j = i, frames = 0;
          while (frames < gap && j < msgs.length - 2) frames += size(msgs[j++]);
          if (frames === gap && size(msgs[j]) === n && j + 1 < msgs.length - 1) return { seed, from: i, to: j, msgs };
        }
      }
      return null;
    };
    for (const [gap, n, played] of [[10, 3, false], [9, 4, false], [10, 2, true]]) {
      const c = find(gap, n);
      if (!c) { check(`the refusal: ${gap} concealed in front of ${n} frames: a case was found`, false); continue; }
      const opts = { gate: false, seed: c.seed }, lose = (i) => i >= c.from && i < c.to;
      const h = hooked(), r = await render(x, { ...opts, loseMessage: lose }, h);
      const ref = await reference(x, opts, lose), m = matches(h, ref);
      const a = ref.arrivals.find((e) => e.k === c.to), after = ref.arrivals.find((e) => e.k > c.to);
      const span = h.gained.subarray(Math.max(0, a.at), a.at + SLOT * (gap + n));
      const net = r.codecInfo.network;
      if (played) {
        check(`the refusal: ${gap} concealed in front of ${n} frames (12 frames, 10,584 samples) is played (seed ${c.seed})`,
          !a.refused && net.refusedMessages === 0 && a.y.length === SLOT * 12 && span.some((v) => v !== 0) && ok3(m), says(m));
        continue;
      }
      // The next packet against a reference that kept the refused packet
      // from the resampler.
      const skip = await reference(x, opts, lose, { skipRefused: true }), next = skip.arrivals.find((e) => e.k === after.k);
      const nextGot = h.resampled[ref.arrivals.indexOf(after)].y;
      check(`the refusal: ${gap} concealed in front of ${n} frames (${gap + n} frames, ${SLOT * (gap + n)} samples; seed ${c.seed}): the gain and the render hold nothing of the packet, refusedMessages is 1, and the next packet is the reference's that resampled the refused one, not one that skipped it`,
        a.refused && a.concealed === gap && net.refusedMessages === 1 && net.lostMessages === c.to - c.from && span.length === SLOT * (gap + n)
        && span.every((v) => v === 0) && ok3(m) && same(Array.from(nextGot), Array.from(after.y)) && !same(Array.from(nextGot), Array.from(next.y)),
        `${says(m)}; the packet at ${a.at}`);
    }
  }

  // Test 5. A lost end marker. The usual case: the next opening arrives,
  // below the expected number: a reset, and the samples of a render whose
  // marker arrived. Then a next spurt whose first frame to arrive is at or
  // above the old expected number: no reset, the gap counted from the old
  // number, decoded on the old state.
  {
    const s0 = own(0), last = s0[s0.length - 1];
    const h0 = hooked(), h = hooked();
    await render(xb, ob, h0);
    await render(xb, { ...ob, loseMessage: (i) => i === last }, h);
    const ref = await reference(xb, ob, (i) => i === last), m = matches(h, ref);
    const second = (hh) => hh.decoded.filter((e) => e.msg.spurt === 1);
    const a = second(h), b = second(h0);
    check('a lost end marker, the usual case: the next spurt\'s opening is below the expected number, so the decoder resets and its spurt\'s samples are those of the render whose marker arrived',
      mb[last].end && a.length === b.length && a.length > 3 && a.every((e, i) => same(Array.from(e.pcm), Array.from(b[i].pcm))) && ok3(m), says(m));
    // Spurt 0 keeps only its opening (N frames: the old expected number);
    // spurt 1 loses messages from its opening until c >= N frames are gone,
    // so its first frame to arrive has number c. Asserted from the dry run.
    // The second case loses one message more of spurt 1.
    const N = size(mb[s0[0]]), s1 = own(1);
    const cs = [];
    for (const more of [0, 1]) {
      const lose = new Set(s0.slice(1));
      let c = 0, i = 0;
      while (c < N) { lose.add(s1[i]); c += size(mb[s1[i++]]); }
      for (let q = 0; q < more; q++) { lose.add(s1[i]); c += size(mb[s1[i++]]); }
      const arriving = s1[i];
      const hc = hooked(), rc = await render(xb, { ...ob, loseMessage: (k) => lose.has(k) }, hc);
      const refc = await reference(xb, ob, (k) => lose.has(k)), mc = matches(hc, refc);
      const reset = await reference(xb, ob, (k) => lose.has(k), { resetEachSpurt: true });
      const got = hc.decoded.find((e) => e.msg.spurt === 1), want = refc.arrivals.find((e) => e.k === arriving), fresh = reset.arrivals.find((e) => e.k === arriving);
      cs.push(c);
      check(`a lost end marker, carried: spurt 0 keeps its opening of ${N} frames, spurt 1 loses ${c} frames, so its first frame to arrive (number ${c}) is ${c === N ? 'at' : 'above'} the old expected number: ${Math.min(10, c - N)} concealed, decoded on the old state, not on a fresh decoder`,
        mb[s0[s0.length - 1]].end && c >= N && got && got.msg.first === mb[arriving].first && want.concealed === Math.min(10, c - N)
        && same(Array.from(got.pcm), Array.from(want.pcm)) && !same(Array.from(got.pcm), Array.from(fresh.pcm)) && ok3(mc),
        `${says(mc)}; ${rc.codecInfo.network.lostMessages} lost`);
    }
    check('a lost end marker, carried: the dry run makes both cases, the first frame to arrive at the old expected number and above it', cs[0] >= N && cs[1] > N, `${cs.join(' and ')} frames lost against ${N}`);
  }

  // Test 6. A lost silence record: no call to the resampler, nothing for the gain.
  {
    const rec = mb.findIndex((m) => m.silence !== undefined);
    const plain = await render(xb, ob), h = hooked(), r = await render(xb, { ...ob, loseMessage: (i) => i === rec }, h);
    const ref = await reference(xb, ob, (i) => i === rec), m = matches(h, ref);
    const h0 = hooked();
    await render(xb, ob, h0);
    check('a lost silence record: one resampler call fewer, and the gain\'s output is the reference\'s (which the record\'s zeros would have changed)',
      rec > 0 && r.codecInfo.resampler.calls === plain.codecInfo.resampler.calls - 1 && ok3(m) && !same(Array.from(h.gained), Array.from(h0.gained)),
      `record ${rec} of ${mb[rec].silence} samples; ${r.codecInfo.resampler.calls} calls against ${plain.codecInfo.resampler.calls}`);
  }

  // Test 7. Own time: under loss every played frame's slot holds what the
  // same slot holds with nothing lost.
  {
    const x = talk(20, 3);
    let slots = 0, empty = 0, ok = true;
    for (const seed of [1, 2, 3]) {
      const plain = (await render(x, { seed })).codecInfo, lossy = (await render(x, { seed, lossPct: 37 })).codecInfo;
      for (let i = 0; i < lossy.frameLog.length; i++) {
        const c = lossy.frameLog[i];
        if (!c) { if (plain.frameLog[i]) empty++; continue; }
        slots++;
        if (lossy.frameBytes[i] !== plain.frameBytes[i] || (c !== 5 && c !== plain.frameLog[i]) || !plain.frameLog[i]) ok = false;
      }
    }
    check('own time: at 37% loss (seeds 1 to 3) every played frame\'s slot holds the size and code that slot holds with nothing lost (a concealed one: lost)',
      ok && slots > 1000 && empty > 0, `${slots} played slots; ${empty} slots left empty`);
  }
  // A gap of 15 (a hand-made frame mask) in front of a message of 1 or 2
  // frames: 5 empty slots, then the gap's last 10 frames concealed, each in
  // its own slot, and nothing after the gap moves. Gaps of 10 and 5.
  {
    const x = talk(8, 13, 0.3), { msgs } = senderOf(x, { gate: false });
    const m = msgs.find((e) => e.first >= 60 && size(e) >= 1 && size(e) <= 2 && e !== msgs[msgs.length - 1]);
    const lossAt = (from, n) => (count) => Uint8Array.from({ length: count }, (_, f) => (f >= from && f < from + n ? 1 : 0));
    const plain = await render(x, { gate: false });
    const by = async (n) => (await withMask(lossAt(m.first - n, n), () => render(x, { gate: false }))).codecInfo;
    const lost15 = await by(15), lost10 = await by(10), lost5 = await by(5);
    const lostSlots = (info) => Array.from(info.frameLog).flatMap((c, i) => (c === 5 ? [i] : []));
    const p = plain.codecInfo, s15 = lostSlots(lost15), s0 = s15[0];
    const run = (from, n) => Array.from({ length: n }, (_, k) => from + k);
    const bytes = (info, a, b) => Array.from(info.frameBytes.subarray(a, b)), codes = (info, a, b) => Array.from(info.frameLog.subarray(a, b));
    const end = p.frameLog.length;
    check(`a gap of 15 in front of a message of ${size(m)} frame(s): 5 empty slots, then 10 concealed, each the size of the frame of its own slot, and nothing after the gap moves`,
      same(s15, run(s0, 10)) && same(codes(lost15, s0 - 5, s0), [0, 0, 0, 0, 0]) && codes(p, s0 - 5, s0).every((c) => c !== 0)
      && same(bytes(lost15, s0 - 5, end), [0, 0, 0, 0, 0, ...bytes(p, s0, end)]) && same(codes(lost15, s0 + 10, end), codes(p, s0 + 10, end)),
      `lost slots ${s15[0]} to ${s15[s15.length - 1]}`);
    check('gaps of 10 and 5 in front of the same message: as many concealed slots, where those frames lie with nothing lost, and nothing moves',
      same(lostSlots(lost10), run(s0, 10)) && same(bytes(lost10, 0, end), bytes(p, 0, end)) && same(lostSlots(lost5), run(s0 + 5, 5))
      && same(bytes(lost5, 0, end), bytes(p, 0, end)) && lost15.network === undefined);
  }

  // Test 9. createRender is process() for the loss cases, in odd pieces.
  {
    const canonical = (v) => {
      if (ArrayBuffer.isView(v)) return { [v.constructor.name]: Array.from(v) };
      if (Array.isArray(v)) return v.map(canonical);
      if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
      return v;
    };
    const pieces = [1, 7, 2, 959, 961, 13, 4097, 333, 12345, 1, 30011, 480, 481];
    const x = talk(12, 17), s0 = own(0);
    const cases = [['37%, seed 2', { seed: 2, lossPct: 37 }, x], ['49.8% and 50 ms jitter, seed 3', { seed: 3, lossPct: 49.8, jitterMs: 50 }, x],
      ['49.8%, the gate off', { seed: 1, lossPct: 49.8, gate: false }, x],
      ['a lost end marker and a lost silence record (loseMessage)', { ...ob, loseMessage: (i) => i === s0[s0.length - 1] || mb[i].silence !== undefined }, xb]];
    for (const [name, o, src] of cases) {
      const whole = await render(src, o);
      const r = await TF2Audio.createRender({ sampleRate: R, length: src.length, numberOfChannels: 1 }, { codec: 'steam', volume: 1, ...o });
      const parts = [];
      for (let at = 0, k = 0; at < src.length; k++) { const n = Math.min(pieces[k % pieces.length], src.length - at); parts.push(await r.push(src.subarray(at, at + n))); at += n; }
      const fin = await r.finish();
      parts.push(fin.samples);
      const out = Float32Array.from(parts.flatMap((p) => Array.from(p)));
      check(`createRender is process() for ${name}, pushed in odd pieces: the samples and codecInfo`,
        same(Array.from(out), Array.from(whole.samples)) && JSON.stringify(canonical(fin.codecInfo)) === JSON.stringify(canonical(whole.codecInfo))
        && whole.codecInfo.network && whole.codecInfo.network.lostMessages > 0, JSON.stringify(whole.codecInfo.network));
    }
  }

  // Review round, S1: re-timing (opts.retime) under loss and jitter moves
  // each sender's spurt whole, its frame log with its samples, a spurt with
  // empty time inside it (frames past ten concealed, or a refused packet)
  // included: every slot that holds one of a spurt's frames without
  // re-timing holds it, with its size, the same number of slots earlier with
  // it (0, or a move's frames). Without retimeSpurts' merge of runs whose
  // spans meet, such a spurt's frames after the hole stay behind.
  {
    const x = talk(20, 3);
    let moved = 0, holed = 0, spurts = 0, broken = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const o = { seed, lossPct: 49.8, jitterMs: 100 };
      const r0 = (await render(x, o)).codecInfo, r1 = (await render(x, { ...o, retime: true })).codecInfo, L = r0.lookahead;
      const shifts = [0, ...r1.retimed.map((m) => Math.round(Math.round(m.shiftMs * VR / 1000) / SLOT))];
      for (const sp of r0.sender.spurts) {
        const slots = [];
        for (let i = 0; i < r0.frameLog.length; i++) {
          const c = 480 * i + 240 - L;
          if (c >= sp.start && c < sp.start + 480 * sp.frames && r0.frameLog[i]) slots.push(i);
        }
        if (!slots.length) continue;
        spurts++;
        const hole = slots.some((v, j) => j > 0 && v - slots[j - 1] > 1);
        const d = shifts.find((dd) => slots.every((i) => i - dd >= 0 && r1.frameLog[i - dd] === r0.frameLog[i] && r1.frameBytes[i - dd] === r0.frameBytes[i]));
        if (d === undefined) broken.push(`seed ${seed} from ${sp.start}`);
        else if (d > 0) { moved++; if (hole) holed++; }
      }
    }
    check('re-timing under loss (49.8%, jitter 100 ms, seeds 1 to 6) moves each sender\'s spurt whole, its frame log with it, those with empty time inside them included',
      broken.length === 0 && moved >= 4 && holed >= 1, `${spurts} spurts, ${moved} moved, ${holed} of them with a hole${broken.length ? `; split: ${broken.join(', ')}` : ''}`);
  }

  // Review round, S3: an end marker alone is a message and takes a draw
  // (decision 1). With the sender's own clock it comes only from finish()
  // with the gate off and nothing kept, as the last message, so the decoder
  // state it leaves (rule C) is shown on the codec module's stream with a
  // second spurt put after it.
  {
    const o = { seed: 0xC0FFEE, gate: false }, exact = talk(4, 17).subarray(0, 96000 - senderOf(talk(4, 17), o).info.lead);   // as above
    const { msgs } = senderOf(exact, o), k = msgs.length - 1, marker = msgs[k];
    const calls = [], plain = await render(exact, o);
    const r = await render(exact, { ...o, loseMessage: (i) => { calls.push(i); return i === k; } });
    const u = TF2Audio.mulberry32(((0xC0FFEE >>> 0) ^ 0x4C4F5353) >>> 0), us = msgs.map(() => u());
    const pct = Math.floor(us[k] * 10000 + 1) / 100, want = us.filter((v) => v < pct / 100).length;
    const rd = await render(exact, { ...o, lossPct: pct });
    check('an end marker alone takes a draw: loseMessage is asked for it and can lose it (messages and lostMessages count it), and at a loss just above its own draw the draw counts it lost',
      marker.end && marker.last === marker.first - 1 && marker.pcm.length === 0 && calls.length === msgs.length && calls.every((v, i) => v === i)
      && r.codecInfo.network.messages === msgs.length && r.codecInfo.network.lostMessages === 1 && same(Array.from(r.samples), Array.from(plain.samples))
      && pct < 100 && us[k] < pct / 100 && rd.codecInfo.network.lostMessages === want && rd.codecInfo.network.messages === msgs.length,
      `${msgs.length} messages, the marker's draw ${us[k].toFixed(4)}; at ${pct}%: ${rd.codecInfo.network.lostMessages} lost (want ${want})`);
    // A second spurt after it on the stream: its first frame to arrive is
    // above the expected number of the first spurt (N, all of whose frames
    // arrived), so with the marker lost the gap from N is concealed from the
    // old state; with it delivered, a fresh decoder conceals ten (zeros).
    const steamP = engine.CODEC_PROFILES.steam;
    const streamOf = () => engine.codec.createSteamStream(steamP.bitrate, { application: steamP.application, signal: steamP.signal,
      runtime: steamP.encoder?.runtime, complexity: steamP.encoder?.complexity, vbr: steamP.encoder?.vbr, dtx: steamP.encoder?.dtx });
    const N = marker.first, b = senderOf(talk(8, 19), { seed: 3, gate: false }).msgs;
    const seq = [...msgs, ...b.map((m) => ({ ...m, spurt: m.spurt + 1, first: m.first + N, last: m.last + N }))];
    const lostB = new Set();
    let c = 0, j = k + 1;
    while (c < N) { lostB.add(j); c += size(seq[j++]); }
    lostB.add(j); c += size(seq[j++]);
    const arriving = j;
    const run = async (markerLost) => {
      const st = await streamOf();
      let out = null;
      try { for (let i = 0; i <= arriving; i++) { const made = await st.message(seq[i], () => 0, i === k ? markerLost : lostB.has(i)); if (i === arriving) out = made; } }
      finally { await st.free(); }
      return out;
    };
    const carried = await run(true), fresh = await run(false);
    const concealed = (made) => made.blocks.filter((x) => x.code === 5).length;
    const head = (made, n) => made.pcm.subarray(0, 480 * n);
    const n1 = concealed(carried);
    check(`the decoder after a lost end marker alone (rule C): the next spurt's first frame to arrive, number ${c}, is above the old expected number ${N}: ${Math.min(10, c - N)} concealed from the old state; with the marker delivered, 10 from a fresh decoder (zeros)`,
      c > N && n1 === Math.min(10, c - N) && concealed(fresh) === 10 && head(fresh, 10).every((v) => v === 0) && n1 > 0 && head(carried, n1).some((v) => v !== 0),
      `${n1} and ${concealed(fresh)} concealed`);
  }

  // Review round, N1: jitter's late frame inside a gap of more than ten lost
  // frames, in front of a one-frame message (a hand-made frame mask): the
  // arriving frame is laid at its own slot, and nothing after it moves.
  // (The order's formula, anchor + 882 x the first block's frame, puts it a
  // slot early here: the late frame is not among the concealed blocks.)
  {
    const x = talk(8, 13, 0.3), { msgs } = senderOf(x, { gate: false });
    const m = msgs.find((e) => e.first >= 60 && size(e) === 1 && e !== msgs[msgs.length - 1]), g = m.first - 13;
    const mask = (count) => Uint8Array.from({ length: count }, (_, f) => (f >= g && f < m.first ? (f === g + 5 ? 2 : 1) : 0));
    const plain = (await render(x, { gate: false })).codecInfo, got = (await withMask(mask, () => render(x, { gate: false }))).codecInfo;
    const L = plain.lookahead, slotOf = (f) => Math.ceil((-2400 + 480 * f + L - 240) / 480), s = slotOf(m.first), end = plain.frameLog.length;
    const tail = (info, code) => Array.from(code ? info.frameLog.subarray(s, end) : info.frameBytes.subarray(s, end));
    check('jitter and a gap of more than ten: 12 lost and 1 late frame in front of a one-frame message, the arriving frame at its own slot and nothing after it moved',
      plain.frameBytes[s] > 0 && same(tail(got, 0), tail(plain, 0)) && same(tail(got, 1), tail(plain, 1)) && got.underrunFrames === 1
      && Array.from(got.frameLog.subarray(s - 10, s)).filter((v) => v === 5).length >= 9 && got.network === undefined,
      `the arriving frame ${m.first} at slot ${s}`);
  }

  // Test 11 (with test 8's renders in the live section): no record passes 16.
  check('no record passes 16 frames over the loss renders of tests 1 and 3', records.length > 1000 && Math.max(...records) <= 16,
    `${records.length} records, the longest ${Math.max(...records)} frames`);
}

/* [10b] for `steam` (W3-11b): the live chain is the render. Expected values
 * come from createRender on the same input (at its mix point, through
 * onGain), from the order (the give-out rule, the reaches) or from a dry run
 * of Steam's sender; never from the live chain's own output. */
async function liveSteamSection() {
  console.log('\n[10b] Live chain, steam: the render\'s own stages (W3-11b)');
  const Sender = require(path.join(root, 'steam-sender.js'));
  const S = Sender.STEAM_SENDER, VR = 44100;
  const PROFILES = engine.CODEC_PROFILES, steam = PROFILES.steam;
  const eqTaps = TF2Audio.firwin2(steam.captureEq.taps, steam.captureEq.freqs, steam.captureEq.gainsDb, 24000);
  const eqDelay = (steam.captureEq.taps - 1) / 2;
  const fullReach = 3 * S.grid + S.preroll, lowReach = 3 * S.grid + S.frame - 1;
  const WAIT = 10 * S.frame * VR / S.rate;            // ten frames at the voice rate (the order)
  const join = (parts) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
    return out;
  };
  const round16 = (y) => Int16Array.from(y, (v) => {
    const s = v * 32768;
    let r = Math.round(s);
    if (r - s === 0.5 && (r & 1)) r -= 1;
    return Math.max(-32768, Math.min(32767, r));
  });
  // What the sender is given from a 24 kHz source: the clip, the capture
  // roll-off, the 16 bits (W3-11a's capture), in this realm.
  const captured = (x) => round16(TF2Audio.applyFirZeroPhase(TF2Audio.hardClip(x, 32767 / 32768), eqTaps));
  // Seeded speech-like talk at any rate: voiced syllables on a noise floor, with pauses.
  const talk = (seconds, rate, seed, level = 0.2) => {
    const rnd = TF2Audio.mulberry32(seed), n = Math.round(seconds * rate), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 3e-4 * (rnd() * 2 - 1);
    let t = Math.round(0.3 * rate);
    while (t < n) {
      const len = Math.round((0.4 + 1.2 * rnd()) * rate), f0 = 100 + 80 * rnd(), amp = level * (0.3 + 0.7 * rnd());
      for (let i = 0; i < len && t + i < n; i++) {
        const time = i / rate, env = Math.sin(Math.PI * i / len) * Math.abs(Math.sin(Math.PI * 3.3 * time)) ** 0.7;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
        x[t + i] += amp * env * (0.7 * v + 0.2 * (rnd() * 2 - 1));
      }
      t += len + Math.round((0.3 + 1.2 * rnd()) * rate);
    }
    return x;
  };
  // The first index where a and b differ over n samples, or -1.
  const firstDiff = (a, b, n = Math.min(a.length, b.length), shift = 0) => {
    for (let i = 0; i < n; i++) if (a[i + shift] !== b[i]) return i;
    return -1;
  };
  const sameInts = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // createRender at its mix point (onGain), with the resampler's packets.
  async function renderRun(x, rate, opts = {}) {
    const laid = [], resampled = [], out = [];
    const r = await TF2Audio.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, { codec: 'steam', volume: 1, ...opts,
      onGain: (g) => laid.push(Float32Array.from(g)),
      onResampled: (y, m) => resampled.push({ y: Int16Array.from(y), spurt: m.spurt, start: m.start, silence: m.silence }) });
    for (let o = 0; o < x.length; o += 4096) out.push(await r.push(x.subarray(o, o + 4096)));
    const fin = await r.finish();
    out.push(fin.samples);
    return { laid: join(laid), resampled, info: fin.codecInfo, samples: join(out) };
  }
  // The live chain fed in blocks of `sizes`; key(b) (optional) is the key before block b.
  async function liveRun(x, rate, opts, sizes, key) {
    const laid = [], resampled = [], moves = [], out = [], codes = [];
    const chain = await TF2Audio.createLiveChain({ codec: 'steam', volume: 1, ...opts,
      onGain: (g) => { if (g.length) laid.push(Float32Array.from(g)); },
      onResampled: (y) => resampled.push(Int16Array.from(y)),
      onMove: (from, to) => moves.push([from, to]) }, rate);
    let o = 0;
    try {
      for (let b = 0; b < sizes.length; b++) {
        if (key) chain.setTalking(key(b));
        const y = await chain.process(x.subarray(o, o + sizes[b]));
        if (y.length) out.push(y);
        o += sizes[b];
        for (const c of chain.takeFrameCodes()) codes.push(c);
      }
    } finally { chain.free(); }
    return { laid: join(laid), resampled, moves, out: join(out), codes, stats: { ...chain.stats, modes: { ...chain.stats.modes } },
      contentDelay: chain.contentDelay, gateDb: chain.gateDb, lowLatencySavingMs: chain.lowLatencySavingMs, slotOffsetSeconds: chain.slotOffsetSeconds };
  }
  // Block plans: fixed sizes, a seeded uneven plan, single samples, the whole
  // source, and (24 kHz sources only) blocks that end exactly on each chunk's
  // last sample, or one sample before: a call to process() that ends on one
  // has pushed exactly that sample to the sender, which trails the input by
  // the capture roll-off's dropped delay (eqDelay samples). The chunk ends
  // are the sender's clock's, from a dry run with the same seed.
  const fixed = (n, size) => Array.from({ length: Math.ceil(n / size) }, (_, k) => Math.min(size, n - k * size));
  const uneven = (n) => {
    const rnd = TF2Audio.mulberry32(77), out = [];
    for (let o = 0; o < n;) { const k = Math.min(n - o, 1 + Math.floor(rnd() * 5000)); out.push(k); o += k; }
    return out;
  };
  const chunkEnds = (n, seed, before) => {
    const clock = Sender.createClock({ seed }), out = [];
    let last = 0;
    for (let at = 0; ;) {
      at += clock.next().samples;
      const end = at + eqDelay - (before ? 1 : 0);
      if (end >= n) break;
      if (end > last) { out.push(end - last); last = end; }
    }
    out.push(n - last);
    return out;
  };
  const plans = (n, seed) => [['128', fixed(n, 128)], ['480', fixed(n, 480)], ['4096', fixed(n, 4096)], ['uneven', uneven(n)],
    ['single samples', fixed(n, 1)], ['whole', [n]], ['on each chunk\'s end', chunkEnds(n, seed, false)],
    ['one before each chunk\'s end', chunkEnds(n, seed, true)]];
  // The sender's messages on a 24 kHz source, each with the count of samples
  // pushed when it came back (pushed one at a time, as the order defines P).
  const dryMessages = (x, opts) => {
    const q = captured(x), s = Sender.createSender(opts), out = [];
    const one = new Int16Array(1), total = x.length - eqDelay;
    for (let P = 1; P <= total; P++) { one[0] = q[P - 1]; for (const m of s.push(one)) out.push({ P, m }); }
    return { events: out, info: s.info(), total };
  };
  // The order's give-out rule, per pushed sample, from the sender's messages
  // and the length of each message's packet (the render's resampler): what
  // is given out at the end, and each opening packet cut against it.
  const giveOutModel = (dry, lengths, reach, lookahead) => {
    let given = 0, cursor = 0, open = false, spurt = null, e = 0, k = 0, moved = 0;
    const cuts = [];
    for (let P = 1; P <= dry.total; P++) {
      for (; e < dry.events.length && dry.events[e].P === P; e++) {
        const m = dry.events[e].m;
        if (m.silence !== undefined) { k++; continue; }
        let opening = false;
        if (m.spurt !== spurt) { spurt = m.spurt; open = true; opening = true; cursor = Math.round((m.start - lookahead) * VR / S.rate); }
        if (m.last >= m.first) {
          const len = lengths[k++];
          let at = cursor;
          if (at < given) { if (opening) cuts.push({ at, len, given }); else { moved++; at = given; } }
          cursor = at + len;
        }
        if (m.end) open = false;
      }
      const R = Math.floor((P - reach - lookahead) * VR / S.rate) - 1;
      given = Math.max(given, Math.min(R, Math.max(open ? cursor : Infinity, R - WAIT)));
    }
    return { given, cuts, moved };
  };
  // A hand-made loss mask, through the codec module's stream (createRender
  // and the live chain both call createSteamStream): mask(f) for frame f.
  const withStreamMask = async (mask, run) => {
    const real = engine.codec;
    engine.codec = { ...real, createSteamStream: async (b, o) => {
      const s = await real.createSteamStream(b, o);
      return { ...s, message: (msg, miss, lost) => s.message(msg, (f) => { miss(f); return mask(f); }, lost) };
    } };
    try { return await run(); } finally { engine.codec = real; }
  };
  const count = (codes, c) => codes.reduce((n, v) => n + (v === c ? 1 : 0), 0);
  // The stream's blocks, message by message (createRender and the live chain
  // both call createSteamStream): what the live chain's per-frame counts are
  // made of.
  // Also each message's whole result (made: its blocks, whether it was lost,
  // its skipped frames).
  const withBlockTally = async (run) => {
    const real = engine.codec, tallies = [], mades = [];
    engine.codec = { ...real, createSteamStream: async (b, o) => {
      const s = await real.createSteamStream(b, o), tally = [], made = [];
      tallies.push(tally);
      mades.push(made);
      return { ...s, message: async (msg, miss, lost) => {
        const m = await s.message(msg, miss, lost);
        tally.push(m.blocks);
        made.push({ blocks: m.blocks, lost: m.lost, skipped: m.skipped, silence: m.silence });
        return m;
      } };
    } };
    try { return { result: await run(), tallies, mades }; } finally { engine.codec = real; }
  };
  // The live chain equals the render over what it gave out: the laid signal,
  // the resampler's packets, the slots' codes.
  const equalsRender = (live, ren) => {
    const n = live.laid.length, log = ren.info.frameLog.subarray(0, live.codes.length);
    return { n, diff: firstDiff(live.laid, ren.laid, n), codes: sameInts(live.codes, log), log,
      packets: live.resampled.length > 0 && live.resampled.every((y, k) => ren.resampled[k] && sameInts(y, ren.resampled[k].y)),
      // A slot is final once its centre, (480 i + 240 - lookahead) x 147/80,
      // is before what was given out: exactly those are counted.
      counted: live.codes.length === Math.ceil(((n * S.rate / VR) + ren.info.lookahead - S.frame / 2) / S.frame)
        && live.stats.frames === live.codes.length && live.stats.sent === live.codes.filter((c) => c !== 0).length
        && live.stats.lost === count(log, 5) && live.stats.late === count(log, 6) };
  };
  const seed = 7;

  // The live chain is the render: 20 s of talk at 24 kHz at four plans, and
  // at 48 kHz at two with no seed passed (as the page passes none: the
  // default seed must be the render's).
  const x24 = talk(20, 24000, 3), x48 = talk(20, 48000, 3);
  const full48 = {};
  for (const [rate, x, o, which] of [[24000, x24, { seed }, ['128', '480', '4096', 'uneven']], [48000, x48, {}, ['480', 'uneven']]]) {
    const tr = await withBlockTally(() => renderRun(x, rate, o)), ren = tr.result;
    for (const [name, sizes] of plans(x.length, seed).filter(([p]) => which.includes(p))) {
      const tl = await withBlockTally(() => liveRun(x, rate, o, sizes)), live = tl.result;
      if (rate === 48000 && name === '480') Object.assign(full48, { live, ren });
      if (rate === 24000 && name === '480') {
        // The per-frame counts are the stream's blocks over the messages the
        // live chain handled, which are the render's first ones; the slots'
        // rule places them; the render's own log keeps its fixed size.
        const handled = tl.tallies[0].length, blocks = tr.tallies[0].slice(0, handled).flat();
        const want = { bytes: 0, dtx: 0, hybrid: 0, silk: 0, celt: 0 };
        for (const b of blocks) { want.bytes += b.bytes; if (b.bytes <= 2) want.dtx++; want[b.mode]++; }
        const st = tl.result.stats, last = blocks[blocks.length - 1];
        check('the live chain\'s per-frame counts (bytes, DTX, modes, the last mode) are the render\'s stream\'s blocks over the messages it handled; slot k starts lookahead before 480 k; a render keeps its fixed log',
          handled > 50 && st.bytes === want.bytes && st.dtx === want.dtx && st.modes.hybrid === want.hybrid && st.modes.silk === want.silk && st.modes.celt === want.celt
          && st.lastMode === (last.bytes <= 2 ? 'dtx' : last.mode) && tl.result.slotOffsetSeconds === -ren.info.lookahead / S.rate
          && ren.info.frames === Math.ceil((x.length + ren.info.lookahead) / S.frame) && ren.info.frameLog.length === ren.info.frames,
          `${handled} messages, ${st.bytes} bytes, ${st.dtx} DTX, ${JSON.stringify(st.modes)}; the render's log ${ren.info.frameLog.length} slots`);
      }
      const eq = equalsRender(live, ren);
      let spurts = '';
      if (rate === 24000) {
        const s = Sender.createSender({ seed });
        s.push(captured(x).subarray(0, x.length - eqDelay));
        spurts = s.info().spurts.length;
      }
      check(`the live chain is the render (${rate / 1000} kHz, blocks of ${name}): the laid signal at the mix point, sample for sample, the resampler's packets and the slots' codes over what it gave out`,
        eq.diff === -1 && eq.n > 0.9 * ren.laid.length && eq.packets && eq.codes && eq.counted && live.stats.droppedLate === 0 && live.stats.movedLate === 0
        && (rate !== 24000 || live.stats.spurts === spurts) && live.stats.spurts >= 5,
        `${eq.n} of ${ren.laid.length} samples given out, first difference at ${eq.diff}; ${live.resampled.length} packets, ${live.codes.length} slots, ${live.stats.spurts} spurts${rate === 24000 ? ` (the sender ${spurts})` : ''}`);
    }
  }
  // The same with other settings, at the uneven plan (the gate off at two),
  // on 8 s of talk; the gain off with voice_scale 2 on louder talk, which the
  // scale and the clip of stage 4 must reach.
  const x8 = talk(8, 24000, 3), x8loud = talk(8, 24000, 3, 0.6);
  {
    const up = [await renderRun(x8, 24000, { seed, steamUptime: 14400 }), await renderRun(x8, 24000, { seed, steamUptime: 3110400 })];
    check('two uptimes end a spurt on different chunks in the render of this source (seed 7: 14400 s and 3110400 s)',
      JSON.stringify(up[0].info.sender.spurts) !== JSON.stringify(up[1].info.sender.spurts));
    const cases = [['the gate off', { gate: false }, ['uneven', '480']], ['steamUptime 14400', { steamUptime: 14400 }], ['steamUptime 3110400', { steamUptime: 3110400 }],
      ['a typed threshold of -46', { gateThresholdDb: -46 }], ['agc off and voice_scale 2, clipping', { agc: false, voiceScale: 2 }, ['uneven'], x8loud],
      ['voice_scale 0.5', { voiceScale: 0.5 }]];
    for (const [name, o, which = ['uneven'], x = x8] of cases) {
      const ren = await renderRun(x, 24000, { seed, ...o });
      const clipped = ren.laid.some((v) => Math.abs(v) === 32767 / 32768);
      for (const [plan, sizes] of plans(x.length, seed).filter(([p]) => which.includes(p))) {
        const live = await liveRun(x, 24000, { seed, ...o }, sizes);
        const eq = equalsRender(live, ren);
        check(`the live chain is the render with ${name} (blocks of ${plan})`,
          eq.diff === -1 && eq.n > 0.9 * ren.laid.length && eq.packets && eq.codes && eq.counted && live.stats.droppedLate === 0 && live.stats.movedLate === 0
          && (o.gate !== false || (ren.info.sender.spurts.length === 1 && ren.info.sender.spurts[0].start === -S.preroll - Sender.createSender({ seed, gate: false }).info().lead && live.gateDb === null))
          && (o.agc !== false || clipped),
          `${eq.n} samples, first difference at ${eq.diff}; gate ${live.gateDb}${o.agc === false ? `; the render clips: ${clipped}` : ''}`);
      }
    }
  }
  // A spurt anchored before sample 0 (the gate off, or sound at the chain's
  // start) whose opening packet loses its last frames ends before 0: the next
  // packet lies before 0 too, where nothing has been given out, and is laid
  // where the render lays it, not moved (the review's finding 1). Hand-made
  // masks: the opening message's last two frames; frames 0 to 9 (the gate
  // off); frames 0 to 6 with a burst from sample 0 (the gate on).
  {
    const opening = (() => {
      const s = Sender.createSender({ seed, gate: false }), q = captured(x8);
      const m = s.push(q).find((v) => v.silence === undefined);
      return m;
    })();
    const burst = Float32Array.from(x8);
    for (let i = 0; i < 0.6 * S.rate; i++) burst[i] = 0.3 * Math.sin(2 * Math.PI * 180 * i / S.rate) + 0.1 * Math.sin(2 * Math.PI * 540 * i / S.rate);
    const cases = [
      ['the gate off, the opening message\'s last two frames lost', x8, { gate: false }, (f) => (f >= opening.last - 1 && f <= opening.last ? 1 : 0)],
      ['the gate off, frames 0 to 9 lost', x8, { gate: false }, (f) => (f < 10 ? 1 : 0)],
      ['a burst from sample 0, the gate on, frames 0 to 6 lost', burst, {}, (f) => (f < 7 ? 1 : 0)]];
    for (const [name, x, o, mask] of cases) {
      const ren = await withStreamMask(mask, () => renderRun(x, 24000, { seed, ...o }));
      const anchored = Math.round((ren.info.sender.spurts[0].start - ren.info.lookahead) * VR / S.rate);
      for (const [plan, sizes] of plans(x.length, seed).filter(([p]) => ['480', 'uneven'].includes(p))) {
        const live = await withStreamMask(mask, () => liveRun(x, 24000, { seed, ...o }, sizes));
        const diff = firstDiff(live.laid, ren.laid);
        check(`at the chain's start, ${name} (blocks of ${plan}): nothing moved, the render's laid signal`,
          anchored < 0 && diff === -1 && live.moves.length === 0 && live.stats.movedLate === 0 && live.stats.droppedLate === 0 && live.laid.length > 0.9 * ren.laid.length,
          `the first spurt anchored at ${anchored}; moves ${JSON.stringify(live.moves)}; first difference ${diff}`);
      }
    }
  }
  // 15% loss and jitter (BC-1: whole messages, and the late frames), on a
  // seed whose message draw, inside a spurt, loses a run of more than ten
  // frames before an arrival (the chain waits ten frames for the cursor, then
  // gives out; that time stays empty and the packet is not moved) and a run
  // of 8 to 10, asserted first from a dry run of the sender and the draw.
  {
    let lossSeed = 0, longest = 0;
    for (let s = 1; s <= 200 && !lossSeed; s++) {
      const dry = Sender.createSender({ seed: s }), msgs = dry.push(captured(x24)), lost = TF2Audio.steamMessageLoss(15, s);
      const runs = [];
      let spurt = null, run = 0;
      for (const m of msgs) {
        const gone = lost();
        if (m.silence !== undefined) continue;
        if (m.spurt !== spurt) { spurt = m.spurt; run = 0; }
        const n = m.last - m.first + 1;
        if (gone) { run += n; continue; }
        // A run inside a spurt: one that ends the spurt is never played.
        if (n > 0 && run) { runs.push({ run, at: m.start }); run = 0; }
      }
      const inside = runs.filter((r) => r.at < x24.length - 2 * S.rate);
      if (inside.some((r) => r.run > 10) && inside.some((r) => r.run >= 8 && r.run <= 10)) { lossSeed = s; longest = Math.max(...inside.map((r) => r.run)); }
    }
    const o = { seed: lossSeed, lossPct: 15, jitterMs: 50 };
    const ren = await renderRun(x24, 24000, o);
    for (const [plan, sizes] of plans(x24.length, lossSeed).filter(([p]) => ['uneven', '128'].includes(p))) {
      const live = await liveRun(x24, 24000, o, sizes);
      const eq = equalsRender(live, ren);
      check(`15% loss and 50 ms jitter (seed ${lossSeed}: inside its spurts runs of 8 to 10 lost frames and of more than ten, the longest ${longest}), blocks of ${plan}: the live chain is the render, nothing is moved, and its lost and late slots are the render's`,
        lossSeed > 0 && eq.diff === -1 && eq.packets && eq.codes && eq.counted && live.stats.lost > 0 && live.stats.late > 0
        && live.stats.droppedLate === 0 && live.stats.movedLate === 0 && live.stats.lostMessages > 0,
        `${eq.n} samples, first difference at ${eq.diff}; ${live.stats.lost} lost and ${live.stats.late} late slots; ${live.stats.lostMessages} messages lost`);
    }
  }
  // The give-out function by itself, for (P, C) pairs: R is the order's.
  {
    const la = 156, reach = fullReach, P = 100000, R = Math.floor((P - reach - la) * VR / S.rate) - 1, frame = S.frame * VR / S.rate;
    const g = (C) => TF2Audio.steamGiveOut(P, C, reach, la, true);
    check('the give-out function: no spurt open gives R; a cursor ahead of R gives R; 9 and 10 frames behind give the cursor; 11 frames behind gives R less ten frames; unbounded (createRender), the cursor',
      g(Infinity) === R && g(R + 500) === R && g(R - 9 * frame) === R - 9 * frame && g(R - 10 * frame) === R - 10 * frame
      && g(R - 11 * frame) === R - 10 * frame && TF2Audio.steamGiveOut(P, R - 11 * frame, reach, la, false) === R - 11 * frame
      && TF2Audio.steamGiveOut(P, Infinity, reach, la, false) === R,
      `R ${R}; 11 frames behind: ${g(R - 11 * frame)}`);
  }
  // 30 frames lost in a row inside a long spurt, at four plans, in front of a
  // message of 1 or 2 frames (BC-1): its ten concealed frames and its own
  // are laid at their own time, the 20 before stay empty, nothing is moved,
  // and the live chain is the render.
  const x10 = talk(10, 24000, 12, 0.25);
  {
    const dry = Sender.createSender({ seed });
    const msgs = dry.push(captured(x10)), spurts = dry.info().spurts;
    let pick = null;
    for (const m of msgs) {
      if (m.silence !== undefined || pick) continue;
      const sp = spurts[m.spurt], n = m.last - m.first + 1, into = m.start - sp.start;
      if (sp.frames >= 80 && n >= 1 && n <= 2 && into >= 40 * S.frame && m.start + 20 * S.frame < sp.start + S.frame * sp.frames
        && sp.start + S.frame * sp.frames < x10.length - S.rate) pick = m;
    }
    const lostFrom = pick ? pick.first - 30 : 0, mask = (f) => (f >= lostFrom && f < lostFrom + 30 ? 1 : 0);
    const ren = await withStreamMask(mask, () => renderRun(x10, 24000, { seed }));
    const log = Array.from(ren.info.frameLog), at = log.findIndex((c) => c === 5);
    const shape = at >= 21 && log.slice(at, at + 10).every((c) => c === 5) && log[at + 10] !== 5 && log[at + 10] !== 0
      && log.slice(at - 20, at).every((c) => c === 0) && log[at - 21] !== 0;
    const outs = [];
    for (const [plan, sizes] of plans(x10.length, seed).filter(([p]) => ['128', 'uneven', 'whole', 'on each chunk\'s end'].includes(p))) {
      let live = null, error = null;
      try { live = await withStreamMask(mask, () => liveRun(x10, 24000, { seed }, sizes)); } catch (e) { error = e; }
      outs.push(live);
      const eq = live ? equalsRender(live, ren) : {};
      check(`30 frames lost in a row in a long spurt, in front of a message of ${pick ? pick.last - pick.first + 1 : '?'} frame(s) (blocks of ${plan}): 20 slots empty, 10 concealed, nothing moved, the live chain is the render`,
        !error && pick && shape && live.moves.length === 0 && live.stats.movedLate === 0 && live.stats.droppedLate === 0
        && eq.diff === -1 && eq.packets && eq.codes && eq.n > 0.9 * ren.laid.length,
        error ? error.message : `the lost slots from ${at}; ${eq.n} samples, first difference ${eq.diff}`);
    }
    check('30 lost: the outputs are the same at every plan', outs.every((o) => o && outs[0]
      && firstDiff(o.out, outs[0].out, Math.max(o.out.length, outs[0].out.length)) === -1));
  }
  // Low latency: no loss, at every plan. Each opening packet is cut where the
  // order's rule (modelled here, sample by sample, from a dry run of the
  // sender and the render's packets) has given out; everything else is the
  // render's.
  {
    const ren = await renderRun(x10, 24000, { seed });
    const dry = dryMessages(x10, { seed });
    const lengths = ren.resampled.map((p) => p.y.length);
    const la = ren.info.lookahead;
    const low = giveOutModel(dry, lengths, lowReach, la), fullModel = giveOutModel(dry, lengths, fullReach, la);
    const dropped = low.cuts.reduce((n, c) => n + Math.max(0, Math.min(c.at + c.len, c.given) - Math.max(c.at, 0)), 0);
    const cutAt = new Uint8Array(ren.laid.length);
    for (const c of low.cuts) cutAt.fill(1, Math.max(c.at, 0), Math.min(c.given, cutAt.length));
    const fullLive = await liveRun(x10, 24000, { seed }, fixed(x10.length, 480));
    const fullDropped = fullModel.cuts.reduce((n, c) => n + Math.max(0, Math.min(c.at + c.len, c.given) - Math.max(c.at, 0)), 0);
    check('full reach: what the live chain gives out is the order\'s rule exactly (modelled from the sender\'s messages), and nothing is cut',
      fullLive.laid.length === fullModel.given && fullDropped === 0 && fullModel.moved === 0 && fullLive.stats.droppedLate === 0,
      `${fullLive.laid.length} given out; the rule ${fullModel.given}`);
    const outs = [];
    const preVoice = S.preroll * VR / S.rate, opened = dry.info.spurts.length;
    for (const [plan, sizes] of plans(x10.length, seed)) {
      const live = await liveRun(x10, 24000, { seed, lowLatency: true }, sizes);
      outs.push(live);
      let diff = -1;
      for (let i = 0; i < live.laid.length; i++) if (!cutAt[i] && live.laid[i] !== ren.laid[i]) { diff = i; break; }
      check(`low latency (blocks of ${plan}): the render's laid signal from each spurt's first given-out sample on; only pre-roll cut, as the order's rule cuts it`,
        diff === -1 && live.laid.length === low.given && live.stats.droppedLate === dropped && dropped > 0
        && dropped <= preVoice * opened && live.stats.movedLate === 0 && low.moved === 0,
        `${live.laid.length} given out (the rule ${low.given}); ${live.stats.droppedLate} dropped (the rule ${dropped}, at most ${Math.round(preVoice * opened)}); first difference ${diff}`);
    }
    // An onset just after the chain's start, in low latency: the first spurt
    // is anchored before 0 while something has been given out, so its cut
    // runs from before 0, and only what lies at or after 0 is counted.
    {
      const x = Float32Array.from(x10);
      x.fill(0, 0, 2400);
      for (let i = 2400; i < 14400; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 180 * i / S.rate) + 0.1 * Math.sin(2 * Math.PI * 540 * i / S.rate);
      const r0 = await renderRun(x, 24000, { seed }), d0 = dryMessages(x, { seed });
      const m0 = giveOutModel(d0, r0.resampled.map((p) => p.y.length), lowReach, r0.info.lookahead);
      const want = m0.cuts.reduce((n, c) => n + Math.max(0, Math.min(c.at + c.len, c.given) - Math.max(c.at, 0)), 0);
      const first = m0.cuts[0] || { at: 0, given: 0 };
      const l0 = await liveRun(x, 24000, { seed, lowLatency: true }, fixed(x.length, 480));
      check('low latency, an onset 0.1 s after the chain\'s start: the first spurt\'s cut starts before 0 and only what lies at or after 0 is counted, as the order\'s rule counts it',
        first.at < 0 && first.given > 0 && l0.stats.droppedLate === want && want > 0,
        `cut from ${first.at} to ${first.given}; ${l0.stats.droppedLate} dropped (the rule ${want})`);
    }
    check('low latency: the outputs and droppedLate are the same at every plan', outs.every((o) => firstDiff(o.out, outs[0].out, Math.max(o.out.length, outs[0].out.length)) === -1
      && o.stats.droppedLate === outs[0].stats.droppedLate));
    const saved = fullLive.stats.latencyMs - outs[0].stats.latencyMs, want = (fullReach - lowReach) / (S.rate / 1000);
    check('low latency lowers latencyMs by exactly the difference of the two reaches over 24 (from the sender\'s constants), and the chain reports that figure',
      Math.abs(saved - want) < 1e-9 && Math.abs(fullLive.lowLatencySavingMs - want) < 1e-9, `${saved.toFixed(3)} ms; the reaches ${fullReach} and ${lowReach}`);
  }
  // BC-1, test 8: the live chain is the render under message loss, at 22,
  // 37 and 50%, three seeds, two plans, full and low latency. The order's
  // give-out rule is modelled per pushed sample from a dry run of the sender
  // and, for each message, the stream's blocks in the render (which frames
  // they stand for: a packet's place is anchor + 882 x (its first block's
  // frame - the spurt's first frame); refused when it passes 11,264 samples).
  // Full latency: nothing cut, nothing moved, the render's laid signal. Low
  // latency: the render's laid signal but where a spurt's first laid packet
  // is cut, as the model cuts it. The lost, late and refused counts are the
  // render's. Also measured: how far before the last sample pushed a played
  // packet starts (the order computes at most 6,239 codec samples for one
  // that is not a spurt's first, the lookahead aside).
  {
    const VSLOT = 882, ROOM = 22528 / 2;
    const lossModel = (dry, mades, reach, lookahead) => {
      let given = 0, cursor = 0, open = false, spurt = null, first = 0, anchor = 0, start = 0, laidIn = false, e = 0, moved = 0, worst = 0, worstFirst = 0;
      const cuts = [];
      for (let P = 1; P <= dry.total; P++) {
        for (; e < dry.events.length && dry.events[e].P === P; e++) {
          const m = dry.events[e].m, made = mades[e];
          if (m.silence !== undefined) continue;
          if (m.spurt !== spurt) {
            spurt = m.spurt; open = true; laidIn = false; first = m.first; start = m.start;
            cursor = anchor = Math.round((m.start - lookahead) * VR / S.rate);
          }
          if (made.blocks.length) {
            const len = VSLOT * made.blocks.length, frame = made.blocks[0].frame, place = anchor + VSLOT * (frame - first);
            if (len > ROOM) cursor = place + len;
            else {
              const back = P - (start + S.frame * (frame - first));
              if (laidIn) worst = Math.max(worst, back); else worstFirst = Math.max(worstFirst, back);
              let at = place;
              if (Math.max(at, 0) < given) { if (!laidIn) cuts.push({ at, len, given }); else { moved++; at = given; } }
              cursor = at + len;
              laidIn = true;
            }
          }
          if (m.end) open = false;
        }
        const R = Math.floor((P - reach - lookahead) * VR / S.rate) - 1;
        given = Math.max(given, Math.min(R, Math.max(open ? cursor : Infinity, R - WAIT)));
      }
      return { given, cuts, moved, worst, worstFirst };
    };
    const cutSum = (cuts) => cuts.reduce((n, c) => n + Math.max(0, Math.min(c.at + c.len, c.given) - Math.max(c.at, 0)), 0);
    const x = talk(12, 24000, 5);
    let records = 0, longest = 0, worst = 0, worstFirst = 0;
    for (const lossPct of [22, 37, 50]) for (const s of [1, 2, 3]) {
      const o = { seed: s, lossPct }, tr = await withBlockTally(() => renderRun(x, 24000, o)), ren = tr.result, mades = tr.mades[0];
      const dry = dryMessages(x, { seed: s }), la = ren.info.lookahead;
      const full = lossModel(dry, mades, fullReach, la), low = lossModel(dry, mades, lowReach, la);
      worst = Math.max(worst, full.worst); worstFirst = Math.max(worstFirst, full.worstFirst);
      for (const m of mades) if (m.blocks.length) { records++; longest = Math.max(longest, m.blocks.length); }
      for (const [plan, sizes] of plans(x.length, s).filter(([p]) => ['uneven', '480'].includes(p))) {
        for (const lowLatency of [false, true]) {
          const tl = await withBlockTally(() => liveRun(x, 24000, { ...o, lowLatency }, sizes)), live = tl.result;
          const handled = tl.mades[0].length, lostWant = mades.slice(0, handled).filter((m) => m.lost).length;
          const refusedWant = ren.resampled.slice(0, live.resampled.length).filter((p) => p.y.length > ROOM).length;
          const model = lowLatency ? low : full;
          // Where the model cuts (none at full latency): the samples, and the
          // slots whose centre lies there, keep what was given out before.
          const cut = new Uint8Array(live.laid.length);
          for (const c of model.cuts) cut.fill(1, Math.max(c.at, 0), Math.max(0, Math.min(c.at + c.len, c.given, cut.length)));
          let diff = -1;
          for (let i = 0; i < live.laid.length; i++) if (!cut[i] && live.laid[i] !== ren.laid[i]) { diff = i; break; }
          const centre = (i) => Math.floor((S.frame * i + S.frame / 2 - la) * VR / S.rate);
          const codes = live.codes.every((c, i) => c === ren.info.frameLog[i] || cut[centre(i)] === 1);
          const counts = live.stats.lostMessages === lostWant && live.stats.refusedMessages === refusedWant && codes
            && live.stats.lost === count(live.codes, 5) && live.stats.late === 0 && live.stats.frames === live.codes.length;
          check(`the live chain is the render at ${lossPct}% loss, seed ${s} (blocks of ${plan}, ${lowLatency ? 'low latency' : 'full latency'}): the laid signal${lowLatency ? ' but the cuts the model makes' : ''}, nothing moved, the same lost, late and refused counts`,
            diff === -1 && live.laid.length === model.given && model.moved === 0 && live.stats.movedLate === 0 && live.moves.length === 0
            && live.stats.droppedLate === cutSum(model.cuts) && (lowLatency || model.cuts.length === 0) && counts && live.laid.length > 0.9 * ren.laid.length,
            `${live.laid.length} given out (the model ${model.given}); first difference ${diff}; dropped ${live.stats.droppedLate} (the model ${cutSum(model.cuts)}); ${live.stats.lostMessages} lost (want ${lostWant}), ${live.stats.refusedMessages} refused (want ${refusedWant})`);
        }
      }
    }
    check('no record passes 16 frames over the renders of the live checks', records > 500 && longest <= 16, `${records} records, the longest ${longest} frames`);
    check('a played packet that is not a spurt\'s first starts at most 6,239 codec samples before the last sample pushed (the order\'s figure)',
      worst > 0 && worst <= 6239, `at most ${worst}; a spurt's first laid packet up to ${worstFirst}`);
  }
  // Review round, S2: opts.loseMessage in the live chain. The chain fed a
  // loseMessage is process() fed the same function at the mix point (full
  // latency, two plans), and counts the messages it lost.
  {
    const lose = (k, m) => k % 4 === 2 || (m.silence === undefined && m.last - m.first + 1 === 5);
    const whole = [];
    const ref = await TF2Audio.process({ sampleRate: 24000, length: x8.length, numberOfChannels: 1, getChannelData: () => x8 },
      { codec: 'steam', volume: 1, seed, loseMessage: lose, onGain: (g) => whole.push(Float32Array.from(g)) });
    const laid = join(whole);
    for (const [plan, sizes] of plans(x8.length, seed).filter(([p]) => ['uneven', '480'].includes(p))) {
      const tl = await withBlockTally(() => liveRun(x8, 24000, { seed, loseMessage: lose }, sizes)), live = tl.result;
      const handled = tl.mades[0].length;
      const want = dryMessages(x8, { seed }).events.slice(0, handled).filter((e, k) => lose(k, e.m)).length;
      const diff = firstDiff(live.laid, laid);
      check(`the live chain with loseMessage is process() with the same function (blocks of ${plan}): the laid signal, nothing moved, the messages it lost`,
        diff === -1 && live.laid.length > 0.9 * laid.length && live.stats.movedLate === 0 && live.stats.lostMessages === want && want > 10
        && ref.codecInfo.network.lostMessages >= want,
        `${live.laid.length} samples, first difference ${diff}; ${live.stats.lostMessages} lost (want ${want})`);
    }
  }
  // contentDelay: the chain's whole output against a render of the same
  // audio; latencyMs less contentDelay is the hold-back.
  {
    const { live, ren } = full48, SR = 48000, d0 = live.contentDelay;
    const correlate = (d) => {
      let dot = 0, ea = 0, eb = 0;
      for (let i = SR / 2; i < live.out.length - 8; i++) { dot += ren.samples[i] * live.out[i + d]; ea += ren.samples[i] ** 2; eb += live.out[i + d] ** 2; }
      return { r: dot / Math.sqrt(ea * eb), levelDb: 10 * Math.log10(eb / ea) };
    };
    let peak = -3;
    for (let d = -3; d <= 3; d++) if (correlate(d).r > correlate(peak).r) peak = d;
    const { r, levelDb } = correlate(peak);
    // W3-10: 0 at any context rate from 44.1 kHz up. Nothing after the mix
    // point shifts the output: the entry and mixOut have no memory, the voice
    // is not upsampled and the device stage starts at phase 0. (Until W3-10
    // the output FIR, run causally, made it round(rate / 44100) = 1.)
    check('contentDelay is the index shift: the live output against a render of the same audio peaks there (0: nothing after the mix point shifts it), at the same level',
      peak === d0 && d0 === 0 && r > 0.999 && Math.abs(levelDb) < 0.01, `peak at ${peak}, contentDelay ${d0}, r ${r.toFixed(5)}, ${levelDb.toFixed(4)} dB`);
    // What the chain holds back shows in how much shorter its output is: the
    // hold-back less Steam's resampler's 16 inputs, which lie inside the laid
    // packets (a render has them too), within the rounding of the bound.
    const holdMs = live.stats.latencyMs - 1000 * d0 / SR, shortMs = 1000 * (x48.length - live.out.length) / SR;
    const swrMs = 1000 * 16 / S.rate;
    check('latencyMs less contentDelay is the hold-back: the output is shorter than the input by it, less Steam\'s resampler\'s 16 inputs',
      Math.abs(holdMs - swrMs - shortMs) < 0.15 && holdMs > 1000 * (fullReach + ren.info.lookahead) / S.rate,
      `hold-back ${holdMs.toFixed(3)} ms; the output ${shortMs.toFixed(3)} ms short`);
    // latencyMs pinned from its terms (the check above allows 0.15 ms): the
    // context's sinc resampler to 24 kHz (16 zero crossings a side, so
    // 16 x max(up, down) / up inputs at the context's rate: 16 at 24 kHz
    // from 48 and from 44.1 kHz), the capture roll-off's dropped delay, the
    // reach, the encoder's lookahead, Steam's resampler's 16 inputs, and the
    // device stage's wait for the next mix sample: one 44100 Hz sample above
    // 44.1 kHz, none at 44.1 kHz (W3-10). Dropping that wait (0.023 ms) or
    // keeping the old sinc resampler's to 48 kHz fails it.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const sincWait = (from, to) => { const g = gcd(from, to), up = to / g, down = from / g; return 16 * Math.max(up, down) / up / from; };
    const wantMs = (rate) => 1000 * (sincWait(rate, S.rate) + (eqDelay + fullReach + ren.info.lookahead + 16) / S.rate + (rate > VR ? 1 / VR : 0));
    const c44 = await TF2Audio.createLiveChain({ codec: 'steam', volume: 1 }, 44100), lat44 = c44.stats.latencyMs;
    c44.free();
    const lat48 = live.stats.latencyMs;
    check('latencyMs is its terms\' sum exactly, with the device stage\'s one 44100 Hz sample at 48 kHz and none at 44.1 kHz: 206.898 and 206.875 ms',
      Math.abs(lat48 - wantMs(48000)) < 1e-6 && Math.abs(lat44 - wantMs(44100)) < 1e-6 && lat48.toFixed(3) === '206.898' && lat44.toFixed(3) === '206.875',
      `48 kHz ${lat48.toFixed(6)} (terms ${wantMs(48000).toFixed(6)}); 44.1 kHz ${lat44.toFixed(6)} (terms ${wantMs(44100).toFixed(6)})`);
  }
  // Push-to-talk, the app's stand-in: the key up twice inside speech is the
  // render of the same source with those blocks zeroed.
  {
    const x = speechLike(12, 24000, -20), B = 480, n1 = [150, 5], n2 = [350, 60];
    const up = (b) => (b >= n1[0] && b < n1[0] + n1[1]) || (b >= n2[0] && b < n2[0] + n2[1]);
    const zeroed = Float32Array.from(x, (v, i) => (up(Math.floor(i / B)) ? 0 : v));
    const ren = await renderRun(zeroed, 24000, { seed });
    const sp = ren.info.sender.spurts, covers = (a, b) => sp.some((s) => s.start <= a && s.start + S.frame * s.frames >= b);
    const bridged = covers(n1[0] * B, (n1[0] + n1[1]) * B), ended = !covers(n2[0] * B, (n2[0] + n2[1]) * B);
    const live = await liveRun(x, 24000, { seed }, fixed(x.length, B), (b) => !up(b));
    const diff = firstDiff(live.laid, ren.laid);
    check('push-to-talk, the app\'s stand-in: with the key up twice (100 ms, bridged by one spurt; 1.2 s, which ends it) the live chain is the render of the source with those blocks zeroed',
      bridged && ended && diff === -1 && live.laid.length > 0.9 * ren.laid.length && sp.length >= 2,
      `${sp.length} spurts in the zeroed render; bridged ${bridged}, ended ${ended}; first difference ${diff}`);
    // At 48 kHz the capture resampler is not the identity: the zeros must
    // come before it, at the chain's input.
    const x48k = speechLike(12, 48000, -20), B48 = 960;
    const zeroed48 = Float32Array.from(x48k, (v, i) => (up(Math.floor(i / B48)) ? 0 : v));
    const ren48 = await renderRun(zeroed48, 48000, { seed });
    const live48 = await liveRun(x48k, 48000, { seed }, fixed(x48k.length, B48), (b) => !up(b));
    const diff48 = firstDiff(live48.laid, ren48.laid);
    check('push-to-talk at 48 kHz (blocks of 960): the live chain is the render of the source with those blocks zeroed',
      diff48 === -1 && live48.laid.length > 0.9 * ren48.laid.length, `first difference ${diff48}`);
    // The input meter still shows the microphone with the key up.
    const chain = await TF2Audio.createLiveChain({ codec: 'steam' }, 24000);
    chain.setTalking(false);
    await chain.process(x.subarray(0, 4800));
    const meter = chain.stats.inputPeak, peak = peakAbs(x.subarray(0, 4800));
    chain.free();
    check('with the key up the input meter still shows the microphone', meter > 0 && Math.abs(meter - peak) < 1e-6, `${meter} against the block's peak ${peak}`);
  }
  // steam with the codec bypassed keeps the frame path (the order's decision 6).
  {
    const chain = await TF2Audio.createLiveChain({ codec: 'steam', enableWarble: false }, 24000);
    const ok = chain.realOpus === false && chain.stats.droppedLate === undefined && chain.slotOffsetSeconds === undefined;
    chain.free();
    check('steam with the codec bypassed keeps the frame path, not the render\'s stages', ok);
  }
  // null, undefined and '' are the profile's own threshold in all three
  // readers; '-46' is -46.
  {
    const x = talk(4, 24000, 5);
    const liveOut = async (o) => (await liveRun(x, 24000, o, fixed(x.length, 960))).out;
    for (const [codec, base] of [['steam', { seed }], ['celt_22', { seed, gate: true }]]) {
      const runs = {};
      for (const [name, v] of [['undefined', undefined], ['null', null], ["''", ''], ['-46', -46], ["'-46'", '-46']]) {
        const o = { ...base, codec, volume: 1, gateThresholdDb: v };
        const p = (await TF2Audio.process(mkBuffer(x, 24000), o)).samples;
        const out = [];
        const r = await TF2Audio.createRender({ sampleRate: 24000, length: x.length, numberOfChannels: 1 }, o);
        out.push(await r.push(x));
        out.push((await r.finish()).samples);
        runs[name] = [p, join(out), await liveOut(o)];
      }
      const same = (a, b) => a.every((s, k) => s.length === b[k].length && firstDiff(s, b[k]) === -1);
      check(`${codec}: gateThresholdDb null, undefined and '' give the same samples in process(), createRender and the live chain; '-46' gives -46's; -46 is another gate`,
        same(runs.null, runs.undefined) && same(runs["''"], runs.undefined) && same(runs["'-46'"], runs['-46']) && !same(runs['-46'], runs.undefined)
        && peakAbs(runs.undefined[2]) > 0.05);
    }
  }
  // steam_48 keeps the frame path: its live output is pinned bit for bit.
  // The hashes were made on main before W3-11b (2026-11-10) and re-recorded
  // by W3-10, whose stages after the mix point change every sample (the
  // entry at 255/256, mixOut's rounding, the device stage in place of the
  // output FIR, the resampler and the limiter); the frame path up to the mix
  // point did not change (73f46557... and a18979bf... before).
  {
    const SR = 48000, src = speechLike(3, SR, -20), crypto = require('crypto'), hashes = [];
    for (const key of [false, true]) {
      const chain = await TF2Audio.createLiveChain({ codec: 'steam_48', volume: 1 }, SR);
      const h = crypto.createHash('sha256');
      for (let o = 0, b = 0; o < src.length; o += SR / 50, b++) {
        if (key) chain.setTalking(!(b >= 40 && b < 70));
        const y = await chain.process(src.subarray(o, o + SR / 50));
        h.update(Buffer.from(y.buffer, y.byteOffset, y.byteLength));
      }
      chain.free();
      hashes.push(h.digest('hex'));
    }
    check('steam_48\'s live output is the recorded one, bit for bit, with the key held and with a scripted key',
      hashes[0] === 'da75a95f25580c3e76bbab9642f0374b34492a700f79ed745a610f209f235c0d' && hashes[1] === 'd001d5dc955033abd73d48b8167089abe6adb527436b7429162c6e4f8cadc2f4',
      hashes.map((h) => h.slice(0, 12)).join(' / '));
  }
}

async function main() {
  engine.codec = await import(require('url').pathToFileURL(path.join(root, 'opus-codec.mjs')).href);

  await steamSection();

  await liveSteamSection();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
