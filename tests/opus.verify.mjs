import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import * as opus from '../opus-codec.mjs';
import { createEncoder, getPacketInfo } from '../vendor/libopus/index.mjs';

let passed = 0;
function check(name, ok) { assert.ok(ok, name); passed++; console.log(`  ok    ${name}`); }
const energy = x => x.reduce((sum, v) => sum + v * v, 0);
const peak = x => { let at = 0; for (let i = 1; i < x.length; i++) if (Math.abs(x[i]) > Math.abs(x[at])) at = i; return at; };
const difference = (a, b) => a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
const sandbox = { window: {}, Blob, console, TF2Opus: opus };
vm.createContext(sandbox);
for (const file of ['../steam-sender.js', '../vendor/swresample/swresample.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), sandbox);
}
vm.runInContext(fs.readFileSync(new URL('../constants.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8'), sandbox);
const A = sandbox.window.TF2Audio;
const buffer = (data, sampleRate) => ({ sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data });

console.log('\n[Opus] Timing, framing, controls, and actual decoder concealment');
for (const rate of [24000, 48000]) {
  for (const length of [0, 1, 17, rate / 10, rate / 10 + 1, rate / 10 + 113]) {
    const x = Float32Array.from({ length }, (_, i) => .2 * Math.sin(2 * Math.PI * 440 * i / rate));
    const result = await opus.roundTrip(x, rate, 32000);
    check(`${rate} Hz / ${length} samples retains exact length`, result.samples.length === length);
    check(`${rate} Hz / ${length} samples stays finite`, result.samples.every(Number.isFinite));
  }
  for (const length of [rate / 10, rate / 10 + 1, rate / 10 + 113]) {
    let middleEnergy;
    for (const fraction of [.5, .05, .95]) {
      const center = Math.round(length * fraction);
      const x = Float32Array.from({ length }, (_, i) => .3 * Math.exp(-.5 * ((i - center) / (rate * .000375)) ** 2));
      const { samples, info } = await opus.roundTrip(x, rate, 64000);
      check(`${rate}/${length}: pulse ${fraction} timing`, Math.abs(peak(samples) - center) <= rate * .0003);
      if (fraction === .5) middleEnergy = energy(samples);
      else check(`${rate}/${length}: boundary pulse survives`, energy(samples) > middleEnergy * .5);
      check('Opus reports exact 20 ms frames and codec delay', info.frameSamples === rate / 50 && info.lookahead > 0);
    }
  }
}

const rate = 24000;
// Voiced harmonics plus changing high-frequency content, unlike a single tone.
const x = Float32Array.from({ length: rate }, (_, i) => .10 * Math.sin(2 * Math.PI * 233 * i / rate)
  + .06 * Math.sin(2 * Math.PI * 3123 * i / rate) + .04 * Math.sin(2 * Math.PI * (5100 * i / rate + 600 * (i / rate) ** 2)));
const base = { codec: 'steam', micGain: 1, voiceScale: 1, listenerPos: 'open', bits: 16 };
const high = await A.process(buffer(x, rate), base);
const low = await A.process(buffer(x, rate), { ...base, bits: 6 });
check('Both quality settings use real Opus', high.realOpus && low.realOpus);
check('Quality changes the actual encoder bitrate', high.codecInfo.bitrate === 32000 && low.codecInfo.bitrate === 12000);
check('Lower bitrate produces fewer encoded bytes', low.codecInfo.encodedBytes < high.codecInfo.encodedBytes * .6);
check('Quality changes the decoded audio', difference(high.samples, low.samples) > .01);
const repeat = await A.process(buffer(x, rate), base);
check('Pinned real codec is repeatable', difference(high.samples, repeat.samples) === 0);
check('Steam profile encodes as VOIP with the voice signal hint', high.codecInfo.application === 'voip' && high.codecInfo.signal === 'voice');
check('Encoder mode per packet is reported from the TOC byte',
  Object.values(high.codecInfo.modes).reduce((a, b) => a + b, 0) === high.codecInfo.frames);
// Timing: the render keeps the source's timeline. The Steam profile runs
// hybrid mode: its CELT layer (8-12 kHz) comes out on time once the encoder
// lookahead is trimmed, but for Steam's resampler, which since W3-11a is
// 16 input samples (0.667 ms) late after its first packet (finding 29: the
// game's, kept), and the laying of the spurt's first packet at a whole voice
// sample; the SILK layer below leads by its own frequency-dependent phase
// (tests/REFERENCE_2026.md, finding 19), which TF2's identical libopus has
// too, so it is kept, not corrected.
{
  const r48 = 48000, n = r48 * 4;
  let seed = 7;
  const white = Float32Array.from({ length: n }, () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 - .5) * .2);
  const band = (v, lo, hi) => { let y = v; for (let k = 0; k < 3; k++) y = A.applyBiquad(A.applyBiquad(y, A.biquadCoefs('lowpass', r48, hi, .707)), A.biquadCoefs('highpass', r48, lo, .707)); return y; };
  const lagUs = (p, q) => {
    const v = {};
    let best = 0;
    for (let l = -40; l <= 40; l++) { let sum = 0; for (let i = r48; i < 3 * r48; i++) sum += p[i] * q[i + l]; v[l] = sum; if (sum > v[best]) best = l; }
    return (best + .5 * (v[best - 1] - v[best + 1]) / (v[best - 1] - 2 * v[best] + v[best + 1])) / r48 * 1e6;
  };
  const whole = await A.process(buffer(white, r48), { ...base, volume: .5 }), rendered = whole.samples;
  const celt = lagUs(band(white, 8000, 11000), band(rendered, 8000, 11000));
  const silk = lagUs(band(white, 1000, 3000), band(rendered, 1000, 3000));
  // The spurt's first packet lies at round((start - lookahead) x 147 / 80).
  const anchor = (whole.codecInfo.sender.spurts[0].start - whole.codecInfo.lookahead) * 147 / 80;
  const late = 1e6 * (16 / 24000 + (Math.round(anchor) - anchor) / 44100);
  check(`The CELT band is ${celt.toFixed(1)} us late, Steam's resampler's 16 inputs as laid (${late.toFixed(1)} us); the SILK band leads it by Opus's own phase (${(silk - celt).toFixed(0)} us)`,
    whole.codecInfo.spurts === 1 && Math.abs(celt - late) < 3 && silk - celt < -20 && silk - celt > -120);
}
// vaudio_celt: the real CELT 0.11 in Source's custom mode.
{
  const r22 = 22050, n = r22 * 2, center = Math.round(n / 2) + 77;
  const pulse = Float32Array.from({ length: n }, (_, i) => .3 * Math.exp(-.5 * ((i - center) / 6) ** 2));
  const { samples, info } = await opus.celtRoundTrip(pulse, r22, { frameSize: 512, packetBytes: 64, complexity: 10 });
  check('vaudio_celt is CELT 0.11 at 22050 Hz, 512-sample frames and 64-byte packets (22.05 kbps)',
    info.backend === 'celt' && /CELT 0\.11/.test(info.version) && info.frameSamples === 512 && info.packetBytes === 64
    && info.bitrate === 22050 && info.encodedBytes === info.frames * 64 && Math.abs(info.frameMs - 23.22) < .01);
  check('CELT output keeps the source timeline (codec delay trimmed)', Math.abs(peak(samples) - center) <= 1 && samples.length === n);
  const tone = Float32Array.from({ length: n }, (_, i) => .2 * Math.sin(2 * Math.PI * 440 * i / r22));
  const lossy = await opus.celtRoundTrip(tone, r22, { frameSize: 512, packetBytes: 64, makeLossMask: count => Uint8Array.from({ length: count }, (_, f) => f % 5 === 2 ? 1 : 0) });
  check('CELT conceals lost frames with its own PLC', lossy.info.lostFrames > 5 && lossy.info.plc === 'celt'
    && energy(lossy.samples) > energy(tone) * .5 && lossy.samples.every(Number.isFinite));
  const app = await A.process(buffer(x, rate), { ...base, codec: 'celt_22' });
  check('The celt_22 profile renders through CELT 0.11', app.realOpus && app.codecInfo.backend === 'celt' && app.codecInfo.frames > 0);
}
// vaudio_celt_high: the 44100 Hz mode (1024-sample frames, 128-byte packets)
// fed 22050 Hz sound, as the engine runs it (W3-03). options.modeRate is the
// mode's rate; everything else stays at the sound's rate.
{
  const r22 = 22050, n = r22 * 2;
  const sine = (f) => Float32Array.from({ length: n }, (_, i) => .25 * Math.sin(2 * Math.PI * f * i / r22));
  const high = { frameSize: 1024, packetBytes: 128, complexity: 5, modeRate: 44100 };
  const { samples, info } = await opus.celtRoundTrip(sine(1000), r22, high);
  check(`vaudio_celt_high: 128-byte packets of ${info.frameMs.toFixed(2)} ms at a reported ${info.bitrate} bps, the ${info.modeRate} Hz mode`,
    info.packetBytes === 128 && info.encodedBytes === info.frames * 128 && info.frameBytes.every(b => b === 128)
    && Math.abs(info.frameMs - 46.44) < .01 && info.bitrate === 22050 && info.modeRate === 44100 && info.sampleRate === r22
    && info.frameSamples === 1024 && samples.length === n);
  // Level out against level in over the middle second: the mode's 20 kHz
  // band edge falls at 10 kHz of real sound. 9 kHz is measured on noise (the
  // band 8.8-9.2 kHz), which the pitch filter leaves alone: on a steady 9 kHz
  // sine the filter, at complexity 5 as in the game, moves the level by
  // +3.4 dB (+0.2 dB at complexity 4, where it is off).
  const middle = (v) => v.subarray(r22 / 2, r22 / 2 + r22);
  const levelDb = (x, out) => 10 * Math.log10(energy(middle(out)) / energy(middle(x)));
  let seed = 7;
  const white = Float32Array.from({ length: n }, () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 - .5) * .5);
  const band = (v, lo, hi) => { let y = v; for (let k = 0; k < 3; k++) y = A.applyBiquad(A.applyBiquad(y, A.biquadCoefs('lowpass', r22, hi, .707)), A.biquadCoefs('highpass', r22, lo, .707)); return y; };
  const noisy = (await opus.celtRoundTrip(white, r22, high)).samples;
  const at9 = levelDb(band(white, 8800, 9200), band(noisy, 8800, 9200));
  const at105 = levelDb(sine(10500), (await opus.celtRoundTrip(sine(10500), r22, high)).samples);
  check(`vaudio_celt_high passes 9 kHz (${at9.toFixed(2)} dB on noise) and leaves nothing at 10.5 kHz (${at105.toFixed(1)} dB)`,
    Math.abs(at9) < 1 && at105 < -40);
  // Without modeRate the mode is created at the sample rate, as before, and
  // the info has no modeRate; with modeRate equal to the sample rate the
  // samples are the same.
  const tone = sine(440), plain = await opus.celtRoundTrip(tone, r22, { frameSize: 512, packetBytes: 64, complexity: 5 });
  const same = await opus.celtRoundTrip(tone, r22, { frameSize: 512, packetBytes: 64, complexity: 5, modeRate: r22 });
  check('Without modeRate the info has none, and modeRate equal to the sample rate changes no sample',
    !('modeRate' in plain.info) && same.info.modeRate === r22 && plain.samples.every((v, i) => v === same.samples[i]));
  const stream = await opus.createCeltStream(r22, high), packet = stream.encode(tone.subarray(0, 1024));
  stream.free();
  check('createCeltStream takes the same modeRate', packet.bytes === 128 && stream.frameSize === 1024);
}
// The bundled CELT is the game's build (docs/reports/W3-08-celt-encoder.md):
// the pitch pre-filter and post-filter compiled in, request 8 after
// creation, 16-bit in and out.
{
  const { testRuns, wasmStream, digest, testSignals, filterFlag, MODES } = await import('./celt011/build.mjs');
  const { createCodec, toInt16 } = await import('../vendor/celt-0.11/index.mjs');
  // Recorded once from `node tests/celt011/build.mjs --native`: the pinned
  // source built natively with gcc 13.3 and glibc on x86-64 (SSE2, no
  // contraction, no fast-math) with the same defines, OPUS_BUILD among them,
  // making index.mjs's calls; a new codec per run, complexity 5. Frames,
  // then the SHA-256 of the packets and of the 16-bit output.
  const NATIVE = {
    'celt voiced': [130, '97313388ea3ee01d68e18d2328aeaf1c8c041d88c6036a36d31a2f621c2952ce', 'cac63fbeaebc40d2567e2261e28fa4832ae81b7a5dc513cb8a6e226f3b2b3d88'],
    'celt tone': [48, 'f5fbac62fcdd5b0b25b29ebddb4be9187b809078aef77a6e5e7be6277b448580', 'e2b37ec16b43e215b0e898e4d0c24a29efc4e28579cdbc56dc6984ea6a42dd58'],
    'celt noise': [44, '8c885803956ca498a9b22851052c0f425f378658c5ff4d91d537b2652a376398', '7ccd1b09790303cf7fc01680d4fa4796553f684026a3697f30d2ccad005b35e9'],
    'celt voiced, restart and loss': [130, '39d4b145ccddfd3aa2f03ddcd8b1006f4f1126c2d525de129a03712252766f84', '0c47058d28fdfb09cf16a96e006880aed5ebdb17aac3484571d35403f52f6f20'],
    'high voiced': [65, '74c8c88927b3741608d8a21c88f0347d864eb3a8b94cb2b7c04c87c1971c4624', '9d66b7312e73be8b996b3013634d2f6f57598708e9c5b4eb9107483c093575b1'],
    'high tone': [24, '1c34b1d0f8c837ed3071b0537c9e9d84fe7dff2e90f69a52e3f7ed4e67c828ed', '07f8e5cc4ab0c4bb4bbcee1cce16a0d5530335c2e53ca544f8175bf68455f0f5'],
    'high noise': [22, 'f4f4dc244140f05f5047e9366bb1e1e7fc759c12555100d40d2bfd9601d7adc1', '2e02864b0429239993cef9551729a753e81d55c63852f6a4d5b35f3d03a4a456'],
    'high voiced, restart and loss': [65, 'ee0c0330c528e13d0c6a77188678d72a7ce06dd1dedb39c18b0eb75fb47340d6', '111c78f70d67974e02008dfc80f6ee4e82c864a3514950a33ba3f7e875757d6b']
  };
  for (const r of testRuns()) {
    const stream = await wasmStream(r), got = digest(stream, r), [frames, packets, samples] = NATIVE[r.name];
    const per = r.mode.bytes + 2 * r.mode.frame, flagged = Array.from({ length: got.frames }, (_, f) => filterFlag(stream.subarray(f * per, f * per + r.mode.bytes))).filter(Boolean).length;
    check(`CELT ${r.name}: packets and 16-bit output match the native build bit for bit (${got.frames} frames, ${flagged} with the pitch filter on)`,
      got.frames === frames && got.packets === packets && got.samples === samples);
  }
  // The pitched signals do use the filter, and noise does not.
  const flags = async (mode, signal) => {
    const codec = await createCodec(mode.rate, mode.frame, { packetBytes: mode.bytes, complexity: 5 }), out = [];
    for (let f = 0; (f + 1) * mode.frame <= signal.length; f++) out.push(filterFlag(codec.encode(Float32Array.from(signal.subarray(f * mode.frame, (f + 1) * mode.frame), v => v / 32768))));
    codec.free();
    return out.filter(Boolean).length / out.length;
  };
  const signals = testSignals();
  for (const [name, mode] of Object.entries(MODES)) {
    const voiced = await flags(mode, signals.voiced), noise = await flags(mode, signals.noise);
    check(`CELT ${name}: the pitch filter is on in ${(100 * voiced).toFixed(0)}% of the speech-like signal's packets, ${(100 * noise).toFixed(0)}% of noise's`,
      voiced > .5 && noise === 0);
  }
  // A harmonic tone (200 Hz and eight overtones) at 22050 Hz: with the pitch
  // filter the encoder follows it about 6 dB better than the build without
  // it, at the same packet size. Measured once on both builds: 19.45 and
  // 25.67 dB for vaudio_celt, 23.35 and 29.08 dB for vaudio_celt_high.
  // Complexity 4 and below turn the filter off (19.62 and 23.60 dB); 5 and
  // above are one encoder.
  const r22 = 22050, n = 2 * r22;
  const harmonic = Float32Array.from({ length: n }, (_, i) => { let v = 0; for (let h = 1; h <= 9; h++) v += Math.sin(2 * Math.PI * 200 * h * i / r22 + h) / h; return .15 * v; });
  const snr = async (opts) => {
    const out = (await opus.celtRoundTrip(harmonic, r22, opts)).samples;
    let e = 0, s = 0;
    for (let i = r22 / 2; i < n - r22 / 2; i++) { e += (out[i] - harmonic[i]) ** 2; s += harmonic[i] ** 2; }
    return 10 * Math.log10(s / e);
  };
  const low = await snr({ frameSize: 512, packetBytes: 64, complexity: 5 }), lowOff = await snr({ frameSize: 512, packetBytes: 64, complexity: 4 });
  const hi = await snr({ frameSize: 1024, packetBytes: 128, complexity: 5, modeRate: 44100 }), hi10 = await snr({ frameSize: 1024, packetBytes: 128, complexity: 10, modeRate: 44100 });
  check(`CELT with the pitch filter follows a harmonic tone at ${low.toFixed(2)} dB (vaudio_celt) and ${hi.toFixed(2)} dB (vaudio_celt_high); at complexity 4, ${lowOff.toFixed(2)} dB`,
    low > 22.5 && hi > 26 && lowOff < 21 && hi10 === hi);
  // Request 8 after creation (the game's module sends it): in a float build
  // it sets the encoder's tonal average to 1 where creation left 256, which
  // changes the first packets of sound. Shown here on the module's own
  // exports; the native hashes above pin index.mjs's use of it.
  {
    const b64 = (await import('../vendor/celt-0.11/celt-0.11.wasm.mjs')).default;
    const x = (await WebAssembly.instantiate(Buffer.from(b64, 'base64'), {})).instance.exports;
    const mode = x.cc_mode_create(22050, 512), pcm = x.malloc(1024), pkt = x.malloc(64);
    const code = (reset) => {
      const enc = x.cc_encoder_create(mode), out = [];
      x.cc_encoder_set(enc, 2, 5);
      if (reset) x.cc_encoder_set(enc, 8, 0);
      for (let f = 0; f < 16; f++) {
        new Int16Array(x.memory.buffer, pcm, 512).set(signals.voiced.subarray(f * 512, (f + 1) * 512));
        if (x.celt_encode(enc, pcm, 512, pkt, 64) !== 64) throw new Error('encode failed');
        out.push(Buffer.from(new Uint8Array(x.memory.buffer, pkt, 64)).toString('hex'));
      }
      x.celt_encoder_destroy(enc);
      return out;
    };
    const withReset = code(true), without = code(false), differ = withReset.map((p, f) => p !== without[f] ? f : -1).filter(f => f >= 0);
    check(`CELT: with and without request 8 the speech-like signal's first packets differ (packets ${differ.join(', ')} of 16)`,
      differ.length > 0 && differ.length < 16);
    x.free(pcm); x.free(pkt); x.celt_mode_destroy(mode);
  }
  // 16-bit in: a float input is rounded to the nearest 16-bit sample, ties
  // to even, and clamped, as the library's own conversion does.
  check('CELT input rounding: ties go to the even sample, and full scale clamps',
    [[2.5, 2], [3.5, 4], [-2.5, -2], [-3.5, -4], [2.4999, 2], [-0.5, 0], [40000, 32767], [-40000, -32768]].every(([v, want]) => toInt16(v / 32768) === want));
  {
    const ties = Float32Array.from({ length: 512 }, (_, i) => (Math.round(8000 * Math.sin(2 * Math.PI * 200 * i / r22)) + .5) / 32768);
    const even = Float32Array.from(ties, v => toInt16(v) / 32768);
    const a = await createCodec(r22, 512, { packetBytes: 64, complexity: 5 }), b = await createCodec(r22, 512, { packetBytes: 64, complexity: 5 });
    const pa = a.encode(ties), pb = b.encode(even), out = a.decode(pa);
    a.free(); b.free();
    check('CELT encodes a frame of half-step ties as the same frame rounded to even, and decodes to whole 16-bit steps',
      pa.every((v, i) => v === pb[i]) && out.every(v => Number.isInteger(v * 32768)));
  }
  // A packet that is not this mode's (a demo is a file from anywhere): one
  // whose first byte declares a shorter frame is refused before the decoder
  // touches its state, so the frames after it decode as if it had not come;
  // one longer than the packet buffer is refused before it is copied.
  for (const [rate, frame, bytes] of [[22050, 512, 64], [44100, 1024, 128]]) {
    const enc = await createCodec(rate, frame, { packetBytes: bytes, complexity: 5 });
    const voiced = signals.voiced, packets = [];
    for (let f = 0; f < 6; f++) packets.push(enc.encode(Float32Array.from(voiced.subarray(f * frame + 8192, (f + 1) * frame + 8192), v => v / 32768)));
    enc.free();
    const clean = await createCodec(rate, frame, { packetBytes: bytes }), hit = await createCodec(rate, frame, { packetBytes: bytes });
    const want = packets.map(p => clean.decode(p)), refused = [];
    const got = [];
    packets.forEach((p, f) => {
      if (f === 3) for (const lm of [0, 1, 2]) {
        const bad = p.slice();
        bad[0] = (bad[0] & ~0x18) | (lm << 3);
        try { hit.decode(bad); } catch (error) { refused.push(/not of this mode/.test(error.message)); }
      }
      got.push(hit.decode(p));
    });
    let oversize = '';
    const long = new Uint8Array(1276);
    long.set(packets[5]);   // this mode's first byte, so only its length is wrong
    try { hit.decode(long); } catch (error) { oversize = error.name; }
    const after = hit.decode(packets[5]);
    clean.free(); hit.free();
    check(`CELT ${rate}/${frame}: packets declaring a shorter frame are refused (${refused.length} of 3) and leave the decoder as it was; a 1276-byte packet is refused (${oversize})`,
      refused.length === 3 && refused.every(Boolean) && got.every((o, f) => o.every((v, i) => v === want[f][i])) && oversize === 'RangeError' && after.length === frame);
  }
}
const lost = await A.process(buffer(x, rate), { ...base, lossPct: 100 });
// Since W3-11a Steam's decoder conceals a gap only when a later frame of the
// spurt arrives (finding 29): with every frame lost none does, so nothing is
// concealed and no slot is laid.
check('100% loss: no frame arrives, so Steam\'s decoder conceals nothing and every slot is empty',
  lost.codecInfo.plc === 'opus' && lost.codecInfo.lostFrames === 0 && lost.codecInfo.gatedFrames === lost.codecInfo.frames && lost.codecInfo.spurts === 1);
check('No voice leaks through 100% loss from stream start', energy(lost.samples) < 1e-12);
const lossy = await A.process(buffer(x, rate), { ...base, lossPct: 25 });
check('Partial loss conceals packets without changing duration',
  lossy.samples.length === Math.round(x.length * lossy.sampleRate / rate) && lossy.codecInfo.lostFrames > 0 && energy(lossy.samples) > 0);
const silent = await A.process(buffer(new Float32Array(rate), rate), base);
// Opus's own quantization may return very small nonzero PCM for silence.
check('Silence stays below -100 dBFS RMS without added hiss', energy(silent.samples) / silent.samples.length < 1e-10);
// A render starts with a reset gain, at unity for its first 128 voice-rate samples whatever voice_scale is (W3-05).
// Since W3-11a those are the first decoded packet's, laid where the first spurt starts. On x alone that is its
// pre-roll of zeros, before sample 0; so x follows half a second of a faint tone the gate does not send, and
// the first spurt's pre-roll is that tone: the first block is heard there, and nothing after it.
const lead = Float32Array.from({ length: rate / 2 + x.length }, (_, i) => (i < rate / 2 ? 1e-3 * Math.sin(2 * Math.PI * 1000 * i / rate) : x[i - rate / 2]));
// A 44.1 kHz device (W3-10): no device stage, so the output's samples are the mix's.
const muted = await A.process(buffer(lead, rate), { ...base, voiceScale: 0, deviceRate: 44100 });
const mutedAt = Math.round((muted.codecInfo.sender.spurts[0].start - muted.codecInfo.lookahead) * 147 / 80);
const unmutedFrom = muted.samples.findIndex(v => v !== 0), unmutedAt = muted.samples.findLastIndex(v => v !== 0);
check('Receiver mute is exact silence after the first block, which is heard where the first spurt starts',
  muted.sampleRate === 44100 && mutedAt > 0 && unmutedFrom >= mutedAt && unmutedAt >= mutedAt && unmutedAt <= mutedAt + 129,
  `first block laid at ${mutedAt}; not zero from ${unmutedFrom} to ${unmutedAt}`);
// x is about -21 dBFS RMS; stay above the Steam voice gate (-39.5 dBFS) so the gain is what is tested.
const quiet = Float32Array.from(x, v => v * .3);
const leveled = await A.process(buffer(quiet, rate), base);
const unleveled = await A.process(buffer(quiet, rate), { ...base, agc: false });
check('Disabling receiver auto-gain preserves quiet input levels', energy(leveled.samples) > energy(unleveled.samples) * 20);
const levelDb = (samples) => 10 * Math.log10(energy(samples) / energy(high.samples));
const doubleIn = await A.process(buffer(Float32Array.from(x, v => v * 2), rate), base);
check('Receiver auto-gain levels a 6 dB input difference to within 0.5 dB', Math.abs(levelDb(doubleIn.samples)) < .5);
// Receiver only: Steam's encoder would put this faint, steady mix into DTX comfort noise.
const faint = await A.process(buffer(Float32Array.from(x, v => v * .05), rate), { ...base, gate: false, enableWarble: false });
// x needs ~6x gain; 26 dB quieter needs ~120x, so voice_maxgain (10) binds.
check('voice_maxgain caps the boost for very quiet input', levelDb(faint.samples) < -19 && levelDb(faint.samples) > -26);
const gatedFaint = await A.process(buffer(Float32Array.from(x, v => v * .05), rate), base);
check('The Steam voice gate holds back input below -39.5 dBFS RMS', energy(gatedFaint.samples) === 0 && gatedFaint.codecInfo.gatedFrames === gatedFaint.codecInfo.frames);
const quarter = await A.process(buffer(x, rate), { ...base, volume: .25 });
const halfVol = await A.process(buffer(x, rate), { ...base, volume: .5 });
// Since W3-10 volume multiplies the mix's 16-bit integers and the result is
// rounded to 16 bits, then the device stage rounds again: twice the render
// at 0.25 is the render at 0.5 within 2 units of 32768 (each rounding is
// half a unit, and the interpolation is linear).
const worst = quarter.samples.reduce((w, v, i) => Math.max(w, Math.abs(2 * v - halfVol.samples[i]) * 32768), 0);
check('Output volume is linear and applied after the voice clamp, to the 16-bit rounding',
  quarter.samples.length === halfVol.samples.length && worst <= 2 && Math.abs(energy(halfVol.samples) / energy(quarter.samples) / 4 - 1) < 1e-3
  && energy(halfVol.samples) > 0, `largest difference ${worst} of 32768`);
for (const sourceRate of [8000, 44100, 96000]) {
  const data = Float32Array.from({ length: 1001 }, (_, i) => .1 * Math.sin(2 * Math.PI * 440 * i / sourceRate));
  const result = await A.process(buffer(data, sourceRate), base);
  check(`${sourceRate} Hz conversion preserves duration after both resamplers`,
    result.samples.length === Math.round(data.length * result.sampleRate / sourceRate));
}
await assert.rejects(() => A.process(buffer(new Float32Array([NaN]), rate), base), /non-finite/);
check('Invalid PCM is rejected before encoding', true);
{
  // Sender gate inside the round trip: 0.2 s at -10 dBFS, then -50 dBFS. Two hold frames follow the last loud one.
  const gx = Float32Array.from({ length: rate }, (_, i) => (i < rate * .2 ? .45 : .0045) * Math.sin(2 * Math.PI * 500 * i / rate));
  const { samples, info } = await opus.roundTrip(gx, rate, 32000, { gate: { thresholdDb: -30, holdFrames: 2 } });
  const frameEnergy = f => energy(samples.subarray(f * 480, (f + 1) * 480));
  check('Gate: loud frames and the hold are transmitted', frameEnergy(5) > 0 && frameEnergy(10) > 0 && frameEnergy(11) > 0);
  check('Gate: closed frames are silent and counted', energy(samples.subarray(13 * 480)) === 0 && info.gatedFrames === info.frames - 12 && info.gate === -30);
  check('Gate: only transmitted frames are encoded', Object.values(info.modes).reduce((a, b) => a + b, 0) === info.frames - info.gatedFrames);
  // Loss mask 2: a late frame plays silence and skips the decoder; 1 is concealed.
  const late = await opus.roundTrip(gx, rate, 32000, { makeLossMask: n => Uint8Array.from({ length: n }, (_, f) => (f === 5 ? 2 : f === 7 ? 1 : 0)) });
  const at = f => energy(late.samples.subarray(f * 480 - late.info.lookahead, (f + 1) * 480 - late.info.lookahead));
  check('Late frame plays as silence; lost frame is concealed', at(5) === 0 && at(7) > 0 && late.info.underrunFrames === 1 && late.info.lostFrames === 1);
  const plain = await opus.roundTrip(gx, rate, 32000);
  check('Gate is off unless requested', plain.info.gatedFrames === 0 && plain.info.gate === null && plain.info.spurts === 1);
  // Pre-roll: the frames before the first loud one are sent too. Loud frames 25-29, so 22-31 go out.
  const px = Float32Array.from({ length: rate }, (_, i) => (i >= rate * .5 && i < rate * .6 ? .45 : .0045) * Math.sin(2 * Math.PI * 500 * i / rate));
  const pr = await opus.roundTrip(px, rate, 32000, { gate: { thresholdDb: -30, prerollFrames: 3, holdFrames: 2 } });
  const prAt = f => energy(pr.samples.subarray(f * 480 - pr.info.lookahead, (f + 1) * 480 - pr.info.lookahead));
  check('Gate: pre-roll frames before an onset are transmitted', pr.info.gatedFrames === pr.info.frames - 10 && prAt(22) > 0 && prAt(21) === 0 && pr.info.prerollFrames === 3);
  // Two bursts 20 frames apart with a 2-frame hold are two talk spurts, each with its own encoder and decoder.
  const bx = Float32Array.from({ length: rate }, (_, i) => ((i < rate * .1) || (i >= rate * .5 && i < rate * .6) ? .45 : 0) * Math.sin(2 * Math.PI * 500 * i / rate));
  const two = await opus.roundTrip(bx, rate, 32000, { gate: { thresholdDb: -30, holdFrames: 2 } });
  check('Gate: separate talk spurts are counted', two.info.spurts === 2);
  // DTX: a steady tone falls silent in Opus's voice detector and is sent as 1-byte comfort-noise packets.
  const steadyTone = Float32Array.from({ length: 2 * rate }, (_, i) => .03 * Math.sin(2 * Math.PI * 1000 * i / rate));
  const withDtx = await opus.roundTrip(steadyTone, rate, 32000, { complexity: 6, vbr: true, dtx: true });
  const noDtx = await opus.roundTrip(steadyTone, rate, 32000);
  check('DTX is opt-in and its comfort-noise frames are counted', withDtx.info.dtx && withDtx.info.dtxFrames > 20 && noDtx.info.dtxFrames === 0 && withDtx.info.encodedBytes < noDtx.info.encodedBytes / 2);
  // The per-frame log behind the visualizer's codec lane agrees with the counters.
  const { FRAME } = opus;
  const count = (info, code) => info.frameLog.reduce((n, c) => n + (c === code), 0);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  check('Frame log: one entry per frame; gate, late and lost frames logged as such', info.frameLog.length === info.frames
    && count(info, FRAME.gated) === info.gatedFrames && count(late.info, FRAME.late) === 1 && count(late.info, FRAME.lost) === 1
    && late.info.frameLog[5] === FRAME.late && late.info.frameLog[7] === FRAME.lost);
  check('Frame log: coded frames by mode, DTX frames as DTX', count(withDtx.info, FRAME.dtx) === withDtx.info.dtxFrames
    && count(info, FRAME.silk) + count(info, FRAME.hybrid) + count(info, FRAME.celt) === info.frames - info.gatedFrames
    && count(info, FRAME.celt) === info.modes.celt && count(info, FRAME.hybrid) === info.modes.hybrid);
  check('Frame log: packet sizes add up to the encoded bytes; gated frames send none',
    sum(info.frameBytes) === info.encodedBytes && info.frameBytes.every((b, f) => (info.frameLog[f] === FRAME.gated) === (b === 0))
    && sum(withDtx.info.frameBytes) === withDtx.info.encodedBytes);
}
{
  // The Steam profile's libopus 1.1.5 build: the release Steam's voice packets match.
  const hash = crypto.createHash('sha256');
  const r = await opus.roundTrip(x, rate, 32000, { runtime: '1.1.5', application: 'voip', signal: 'voice', complexity: 10,
    vbr: true, dtx: true, onPacket: (f, packet) => hash.update(packet) });
  check('libopus 1.1.5 runtime reports its release and codec delay', r.info.version === 'libopus 1.1.5' && r.info.runtime === '1.1.5' && r.info.lookahead === 156);
  // Same packets as a native gcc build of the tagged release (vendor/libopus-1.1/README.md).
  check('libopus 1.1.5 packets match the native reference build bit for bit',
    hash.digest('hex') === '187a77a8beb6582013a2695566f0254d770c2d91c6f574f938cdaf5db616a892' && r.info.encodedBytes === 4681);
  // Steam's DTX follows the SILK voice detector at complexity 10, as 1.1.x does; 1.6.1's tonality analysis keeps a steady tone active.
  const steadyTone = Float32Array.from({ length: 2 * rate }, (_, i) => .03 * Math.sin(2 * Math.PI * 1000 * i / rate));
  const old = await opus.roundTrip(steadyTone, rate, 32000, { runtime: '1.1.5', complexity: 10, vbr: true, dtx: true, signal: 'voice' });
  const cur = await opus.roundTrip(steadyTone, rate, 32000, { runtime: '1.6.1', complexity: 10, vbr: true, dtx: true, signal: 'voice' });
  check('At complexity 10, libopus 1.1.5 puts a steady tone into DTX and 1.6.1 does not', old.info.dtxFrames > 50 && cur.info.dtxFrames === 0);
  // libopus 1.1.x's comfort noise for a steady 50 Hz tone is nearly DC, as in a native build (REFERENCE_2026.md finding 18).
  const hum = Float32Array.from({ length: 8 * rate }, (_, i) => .3 * Math.sin(2 * Math.PI * 50 * i / rate));
  const mean = (a) => a.reduce((sum, v) => sum + v, 0) / a.length;
  const humOld = await opus.roundTrip(hum, rate, 32000, { runtime: '1.1.5', complexity: 10, vbr: true, dtx: true, signal: 'voice' });
  const humNoDtx = await opus.roundTrip(hum, rate, 32000, { runtime: '1.1.5', complexity: 10, vbr: true, dtx: false, signal: 'voice' });
  const humNew = await opus.roundTrip(hum, rate, 32000, { runtime: '1.6.1', complexity: 10, vbr: true, dtx: true, signal: 'voice' });
  check('libopus 1.1.5 comfort noise turns a steady 50 Hz tone into the native build\'s DC offset; without DTX, or in 1.6.1, there is none',
    Math.abs(mean(humOld.samples) - 0.2127) < 0.002 && humOld.info.dtxFrames > 300
    && Math.abs(mean(humNoDtx.samples)) < 0.002 && Math.abs(mean(humNew.samples)) < 0.005);
  await assert.rejects(() => opus.roundTrip(x, rate, 32000, { runtime: '0.9' }), /Unknown libopus runtime/);
  check('Unknown runtimes are rejected', true);
}
// Steam's decoder rules (W3-09 section 4, finding 29), on the decoder alone:
// a gap is concealed when the next frame arrives, at most 10 frames of it; a
// sequence number behind resets without concealing; the end marker resets;
// the render's lost() counts toward the next gap and late() is no gap.
{
  const { createEncoder: enc11, createDecoder: dec11 } = await import('../vendor/libopus-1.1/index.mjs');
  const enc = await enc11({ sampleRate: 24000, channels: 1, frameSize: 480, application: 2048, signal: 3001, bitrate: 32000, complexity: 9, vbr: true, dtx: true, fec: false });
  const packets = Array.from({ length: 40 }, (_, f) => enc.encodeFloat(x.subarray(f * 480, (f + 1) * 480)));
  enc.free();
  const sameBlock = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const fresh = async (p) => { const d = await dec11({ sampleRate: 24000, channels: 1 }); const y = d.decodeInt16(p, { frameSize: 480 }); d.free(); return y; };
  const d = await opus.createSteamDecoder();
  const counts = [];
  counts.push((await d.receive(0, packets[0])).length, (await d.receive(1, packets[1])).length);
  counts.push((await d.receive(5, packets[5])).length);           // 3 lost: 3 concealed, then the frame
  counts.push((await d.receive(21, packets[21])).length);         // 15 lost: 10 concealed
  const behind = await d.receive(7, packets[7]);                  // behind: reset, nothing concealed
  counts.push(behind.length);
  d.lost(8); d.lost(9);
  counts.push((await d.receive(10, packets[10])).length);         // lost() twice: 2 concealed
  const late = d.late(11);
  counts.push((await d.receive(12, packets[12])).length);         // late() is no gap
  d.lost(13);
  const lateAfterLost = d.late(14);
  counts.push((await d.receive(15, packets[15])).length);         // the lost frame before the late one is still concealed
  await d.end();
  const afterEnd = await d.receive(0, packets[30]);
  d.free();
  check(`Steam's decoder: a gap concealed at the next frame, at most 10; behind resets; lost and late frames (blocks ${counts.join(' ')})`,
    counts.join() === '1,1,4,11,1,3,1,2' && sameBlock(behind[0], await fresh(packets[7])) && late.length === 480 && late.every(v => v === 0)
    && lateAfterLost.every(v => v === 0) && sameBlock(afterEnd[0], await fresh(packets[30])));
}
// Sequence numbers are 16 bits, as the packets carry them (W3-16 section 3):
// after 65535 comes 0, with no reset and nothing concealed. The numbers are
// put across the wrap by hand (a spurt reaches it only at its 65,536th frame,
// 22 minutes in): a fresh decoder given 65530 first conceals 10 frames, as
// Steam's would, then 65531 to 65535 and 0 to 5 each decode one frame,
// exactly as one decoder given the same calls. A frame lost at 65535 (the
// decoder never sees it) makes 0 behind 65535: a reset, nothing concealed.
{
  const { createEncoder: enc11, createDecoder: dec11 } = await import('../vendor/libopus-1.1/index.mjs');
  const enc = await enc11({ sampleRate: 24000, channels: 1, frameSize: 480, application: 2048, signal: 3001, bitrate: 32000, complexity: 9, vbr: true, dtx: true, fec: false });
  const packets = Array.from({ length: 12 }, (_, f) => enc.encodeFloat(x.subarray(f * 480, (f + 1) * 480)));
  enc.free();
  const sameBlock = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const one = await dec11({ sampleRate: 24000, channels: 1 });
  const want = [];
  for (let c = 0; c < 10; c++) want.push(one.decodePacketLossInt16(480));
  for (const p of packets) want.push(one.decodeInt16(p, { frameSize: 480 }));
  one.free();
  const d = await opus.createSteamDecoder(), got = [], counts = [];
  for (let i = 0; i < 12; i++) { const b = await d.receive((65530 + i) & 0xFFFF, packets[i]); counts.push(b.length); got.push(...b); }
  d.free();
  const lossy = await opus.createSteamDecoder();
  for (let i = 0; i < 5; i++) await lossy.receive(65530 + i, packets[i]);
  lossy.lost(65535);
  const afterLoss = await lossy.receive(0, packets[6]);
  lossy.free();
  const fresh = await dec11({ sampleRate: 24000, channels: 1 }), reset = fresh.decodeInt16(packets[6], { frameSize: 480 });
  fresh.free();
  check(`Steam's decoder: sequence numbers wrap at 16 bits, 65535 then 0 with no reset and nothing concealed; a frame lost at 65535 makes 0 behind (blocks ${counts.join(' ')})`,
    counts.join() === '11,1,1,1,1,1,1,1,1,1,1,1' && got.length === want.length && got.every((b, i) => sameBlock(b, want[i]))
    && afterLoss.length === 1 && sameBlock(afterLoss[0], reset));
}
// W3-11a rebuilt the libopus 1.1.5 module with the library's 16-bit decoder,
// opus_decode, exported (Steam decodes to 16 bits), and changed nothing else.
{
  const { testSignals, floatRun, int16Stream, digest, ENCODER, FRAME, RATE } = await import('./libopus11/native.mjs');
  const { createEncoder: create11, createDecoder: decoder11 } = await import('../vendor/libopus-1.1/index.mjs');
  const signals = testSignals();
  // The float path must not move: these SHA-256 were recorded from the module
  // as built before opus_decode was exported (b7a03edb...): the packets of 10 s
  // of seeded noise bursts and vowels (some past full scale, and the same at
  // 1/50 of the level), each packet through decodeFloat, and
  // decodePacketLossFloat after every tenth.
  const floatHashes = {
    loud: { packets: '6bee8aa15d63d7f169940b8ecaa9f818555e3b733896e483d54c37e1718a75b2',
      floats: 'faff9b07240216b0d25e9cc60d062ac2b6c4e405d5c88b2b21a683bcbbb7935f',
      lost: '6787c35c12b7c6809ccdab66a493622f44061da95346dd191286e5b9e44d9bc8' },
    quiet: { packets: 'b5226e0b8ff57bdda9fbec567cf244284eda90cad1eb6ea52d474df5b268648f',
      floats: '56d18af46a017607e1ddbe8b9f33078154f1011329d54dca481a0327c8c6fa39',
      lost: '8a03db0fe588c99e2d7db9154b9c7a0b13946090e928192ea8e5d8572a94a5ae' } };
  for (const name of ['loud', 'quiet']) {
    const got = await floatRun(signals[name]);
    check(`libopus 1.1.5 rebuilt: the float path gives the earlier module's packets, decodeFloat and concealment (${name})`,
      JSON.stringify(got) === JSON.stringify(floatHashes[name]));
  }
  // The 16-bit decoder against a native gcc build of the same checkout
  // (`node tests/libopus11/native.mjs <checkout>`, gcc 13.3, x86-64): packets
  // and opus_decode's samples, a concealed frame after every tenth packet.
  const nativeHashes = {
    loud: { packets: '6bee8aa15d63d7f169940b8ecaa9f818555e3b733896e483d54c37e1718a75b2',
      int16: '12e83950d1dbc7bc70705b4a4f853a0fa7492a80c393892c307b4bed49f56cf9' },
    quiet: { packets: 'b5226e0b8ff57bdda9fbec567cf244284eda90cad1eb6ea52d474df5b268648f',
      int16: '24556dbc4662a730a6fa211602cc1a02a99176ecf995d4aef1628f782b015b97' } };
  for (const name of ['loud', 'quiet']) {
    const got = digest(await int16Stream(signals[name]));
    check(`libopus 1.1.5: opus_decode's 16-bit samples match the native build sample for sample (${name}, ${got.samples} samples)`,
      got.packets === nativeHashes[name].packets && got.int16 === nativeHashes[name].int16 && got.frames === 500);
  }
  // It is not the float decoder followed by a clip: the soft clipper changes
  // the samples around a peak past full scale. On the quiet signal the two agree.
  const roundEven = (v) => { const r = Math.round(v); return r - v === 0.5 && (r & 1) ? r - 1 : r; };
  for (const [name, want] of [['loud', (n) => n >= 100], ['quiet', (n) => n === 0]]) {
    const enc = await create11(ENCODER), d16 = await decoder11({ sampleRate: RATE, channels: 1 }), df = await decoder11({ sampleRate: RATE, channels: 1 });
    let differ = 0, over = 0;
    const x = signals[name];
    for (let f = 0; (f + 1) * FRAME <= x.length; f++) {
      const packet = enc.encodeFloat(x.subarray(f * FRAME, (f + 1) * FRAME));
      const a = d16.decodeInt16(packet, { frameSize: FRAME }), b = df.decodeFloat(packet, { frameSize: FRAME });
      for (let i = 0; i < FRAME; i++) {
        if (Math.max(-32768, Math.min(32767, roundEven(b[i] * 32768))) !== a[i]) differ++;
        if (Math.abs(b[i]) > 1) over++;
      }
      if (f % 10 === 9) {
        const pa = d16.decodePacketLossInt16(FRAME), pb = df.decodePacketLossFloat(FRAME);
        for (let i = 0; i < FRAME; i++) if (Math.max(-32768, Math.min(32767, roundEven(pb[i] * 32768))) !== pa[i]) differ++;
      }
    }
    enc.free(); d16.free(); df.free();
    check(`libopus 1.1.5: the 16-bit decoder ${name === 'loud' ? 'soft-clips' : 'equals'} clamp-and-round of decodeFloat (${name}: ${differ} samples differ; ${over} decoded floats past full scale)`,
      want(differ));
  }
}
const aliasSource = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 16000 * i / 48000));
const downsampled = A.resampleSinc(aliasSource, 48000, 24000).slice(100, -100);
check('Downsampling rejects an out-of-band tone instead of aliasing it', energy(downsampled) / downsampled.length < 1e-7);

// Observe the real encoder boundary to verify filter order, not just output EQ.
// Since W3-11a the steam profile's encoder is given the sender's messages
// (16-bit frames); the gate off, so that every frame of the tone is sent.
let captured;
sandbox.TF2Opus = { ...opus, steamRoundTrip: async (messages, bitrate, options) => {
  const sound = messages.filter(m => m.silence === undefined);
  captured = Float32Array.from(sound.flatMap(m => Array.from(m.pcm)), v => v / 32768);
  return opus.steamRoundTrip(messages, bitrate, options);
} };
const highTone = Float32Array.from({ length: rate }, (_, i) => .15 * Math.sin(2 * Math.PI * 8000 * i / rate));
await A.process(buffer(highTone, rate), { ...base, lp: 1500, gate: false });
check('Sender low-pass removes out-of-band energy before encoding', captured.length >= rate && energy(captured) < energy(highTone) * .001,
  `${captured.length} samples encoded`);
sandbox.TF2Opus = opus;
const bypassed = await A.process(buffer(x, rate), { ...base, enableWarble: false });
check('Codec bypass is only selected explicitly and reported honestly', !bypassed.realOpus && bypassed.codecInfo.backend === 'bypass');
sandbox.TF2Opus = { roundTrip: async () => { throw new Error('Codec unavailable'); }, steamRoundTrip: async () => { throw new Error('Codec unavailable'); } };
await assert.rejects(() => A.process(buffer(x, rate), base), /Codec unavailable/);
check('Codec failure is reported, never silently bypassed', true);
sandbox.TF2Opus = opus;

// Independent packet parser confirms actual codec framing, not a metadata label.
const encoder = await createEncoder({ sampleRate: rate, channels: 1, frameSize: 480, bitrate: 32000 });
try {
  const packet = encoder.encodeFloat(x.subarray(0, 480));
  const info = await getPacketInfo(packet, { sampleRate: rate });
  check('Encoded packet parses as mono 20 ms Opus', info.channels === 1 && info.durationMs === 20 && info.samples === 480);
} finally { encoder.free(); }
console.log(`\n${passed} Opus checks passed`);
