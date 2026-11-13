// The 24 kHz clip for Steam's mic_inputfile (docs/REPRODUCE.md, "gate"):
// steam_mic_24000.wav, 16-bit mono at 24000 Hz with a plain 44-byte header,
// the same bytes wherever it is built. A choice of order RP-01b; it has not
// been played into Steam (not built yet). In order:
//
//   0.5 s of silence                        the first chunk of a press is up to 6000 samples (read, finding 28)
//   five 1 kHz bursts of 1.0 s at 8192,     plain loud phrases with pauses longer than any hold of the record's table
//   each followed by 1.2 s of silence
//   a 1 kHz tone at -38 dBFS for 1 s,       the record's two tones: the first stayed shut and the second opened
//   0.5 s of silence, the tone at -35 dBFS  (measured, Set J, finding 28)
//   a 1 kHz tone for 8 s whose mean of      chunks on both sides of 1.0%, close to it
//   |x| rises from 0.90% to 1.10% of 32767
//   and falls back, then 1.2 s of silence
//   eight single samples of 4905 to 4925,   chunks whose largest sample lies on both sides of 4915
//   of both signs, 0.3 s apart
//   a 1.5 ms burst at 0.2 of full scale     the record's burst, which opened by its peak alone (measured, Set J)
//   1.2 s of silence                        the file loops
//
// 679,200 samples (28.3 s), 1,358,444 bytes; its SHA-256 is pinned by the
// suite `reproduce` apart from this file (STEAM_CLIP in inputs.mjs). The
// arithmetic is the order's, line for line.
export const RATE = 24000;
export const NAME = 'steam_mic_24000.wav';

export function steamClipSamples() {
  const out = [];
  const sil = (n) => { for (let i = 0; i < n; i++) out.push(0); };
  const tone = (n, amp) => { for (let i = 0; i < n; i++) out.push(Math.trunc(amp * Math.sin(2 * Math.PI * 1000 * i / RATE))); };
  sil(12000);
  for (let k = 0; k < 5; k++) { tone(24000, 8192); sil(28800); }
  tone(24000, 412); sil(12000); tone(24000, 583); sil(28800);
  for (let i = 0; i < 192000; i++) {
    const u = i < 96000 ? i / 96000 : (192000 - i) / 96000;
    const amp = Math.PI / 2 * 32767 * (0.90 + 0.20 * u) / 100;
    out.push(Math.trunc(amp * Math.sin(2 * Math.PI * 1000 * i / RATE)));
  }
  sil(28800);
  for (const v of [4905, 4910, 4913, -4914, 4915, -4915, 4916, 4925]) { sil(3600); out.push(v); sil(3599); }
  sil(3600); tone(36, 6553); sil(3564);
  sil(28800);
  return Int16Array.from(out);
}

// The plain 44-byte header of a 16-bit mono PCM WAV at 24000 Hz, then the
// samples, little-endian.
export function steamClipWav() {
  const samples = steamClipSamples(), bytes = 2 * samples.length;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(2 * RATE, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + 2 * i);
  return b;
}
