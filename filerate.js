/* A sound file's own sample rate, read from its header, and a decode at that
 * rate. decodeAudioData resamples to the rate of the context it is called on;
 * an AudioContext runs at the audio device's rate, so the same file gave
 * different samples on a 44.1 kHz and a 48 kHz device. An OfflineAudioContext
 * made at the file's own rate decodes it without resampling.
 *
 * TF2FileRate.read(bytes) -> { rate, format, note } or null when the rate
 *   cannot be read. The rate is the one the browser's decoder outputs:
 *   - WAV (PCM, float, WAVE_FORMAT_EXTENSIBLE; RIFF, RF64 and BW64): fmt chunk
 *   - AIFF and AIFF-C (Safari decodes them; Chromium does not): COMM chunk
 *   - FLAC, also after an ID3v2 tag: STREAMINFO
 *   - MPEG audio (MP3; MPEG-1, 2 and 2.5), after any ID3v2 tags: the frame
 *     header, checked against the frames that follow it
 *   - AAC in ADTS: the frame header (see aacRate for HE-AAC)
 *   - Ogg: Vorbis's identification header, Ogg FLAC's STREAMINFO, and Opus
 *     at 48 kHz (Opus always decodes at 48 kHz; OpusHead's rate field is the
 *     encoder's input rate and only informational)
 *   - MP4, M4A and MOV, through video.js's parser: the first sound track's
 *     sample entry (AAC by its AudioSpecificConfig, Opus at 48 kHz, FLAC by
 *     its STREAMINFO, PCM and others by the entry's rate field)
 *   WebM and Matroska are not read (video.js does not parse them): such a
 *   file is decoded at the device rate, as before.
 * TF2FileRate.decode(arrayBuffer, { deviceContext, again }) ->
 *   { buffer, info, native, why }: decoded at the file's rate when it can be
 *   read, is accepted by OfflineAudioContext and the decode there succeeds;
 *   otherwise on deviceContext() (the page's AudioContext), as before, with
 *   `why` saying which. decodeAudioData takes its buffer over, so the bytes
 *   are copied for the first try unless again() can fetch them anew.
 */
(function () {
  'use strict';

  const tag = (u8, at) => String.fromCharCode(u8[at], u8[at + 1], u8[at + 2], u8[at + 3]);
  const u32le = (u8, at) => (u8[at] | (u8[at + 1] << 8) | (u8[at + 2] << 16) | (u8[at + 3] << 24)) >>> 0;
  const u32be = (u8, at) => ((u8[at] << 24) | (u8[at + 1] << 16) | (u8[at + 2] << 8) | u8[at + 3]) >>> 0;
  const plausible = (rate) => Number.isFinite(rate) && rate >= 1000 && rate <= 1536000;
  const result = (rate, format, note = '') => (plausible(rate) ? { rate, format, note } : null);

  // RIFF/RF64/BW64 WAVE: the fmt chunk's rate field (the same place in
  // WAVE_FORMAT_EXTENSIBLE). RF64 puts large sizes in ds64, never fmt's.
  function wav(u8) {
    const kind = tag(u8, 0);
    for (let at = 12; at + 16 <= u8.length;) {
      const id = tag(u8, at), size = u32le(u8, at + 4);
      if (id === 'fmt ') return result(u32le(u8, at + 12), kind === 'RIFF' ? 'WAV' : `WAV (${kind})`);
      if (id === 'data') return null;
      at += 8 + size + (size & 1);
    }
    return null;
  }

  // AIFF and AIFF-C: the COMM chunk's rate, an 80-bit extended float.
  function aiff(u8) {
    for (let at = 12; at + 8 <= u8.length;) {
      const id = tag(u8, at), size = u32be(u8, at + 4);
      if (id === 'COMM' && at + 26 <= u8.length) {
        const f = at + 16, exponent = (((u8[f] & 0x7f) << 8) | u8[f + 1]) - 16383;
        const mantissa = u32be(u8, f + 2) * 4294967296 + u32be(u8, f + 6);
        return result(Math.round(mantissa * 2 ** (exponent - 63)), tag(u8, 8) === 'AIFC' ? 'AIFF-C' : 'AIFF');
      }
      at += 8 + size + (size & 1);
    }
    return null;
  }

  // FLAC's STREAMINFO body: the rate is its 20 bits after the 10th byte.
  const streamInfoRate = (u8, at) => ((u8[at + 10] << 12) | (u8[at + 11] << 4) | (u8[at + 12] >> 4)) >>> 0;
  function flac(u8, at, format = 'FLAC') {
    // The first metadata block is STREAMINFO (type 0, 34 bytes).
    if (at + 8 + 34 > u8.length || (u8[at + 4] & 0x7f) !== 0) return null;
    return result(streamInfoRate(u8, at + 8), format);
  }

  // The bytes after any ID3v2 tags (syncsafe size, plus a footer if flagged).
  function afterId3(u8) {
    let at = 0;
    while (at + 10 <= u8.length && u8[at] === 0x49 && u8[at + 1] === 0x44 && u8[at + 2] === 0x33) {
      const size = (u8[at + 6] << 21) | (u8[at + 7] << 14) | (u8[at + 8] << 7) | u8[at + 9];
      at += 10 + size + (u8[at + 5] & 0x10 ? 10 : 0);
    }
    return at;
  }

  // MPEG audio frame header at `at`: { rate, length, key } or null.
  const MPEG_RATES = [44100, 48000, 32000];
  const MPEG_KBPS = {   // [version 1 | 2][layer 1, 2, 3]
    1: [[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
      [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
      [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]],
    2: [[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
      [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
      [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]]
  };
  function mpegFrame(u8, at) {
    if (at + 4 > u8.length || u8[at] !== 0xff || (u8[at + 1] & 0xe0) !== 0xe0) return null;
    const version = (u8[at + 1] >> 3) & 3, layer = 4 - ((u8[at + 1] >> 1) & 3);
    const bitrate = u8[at + 2] >> 4, rateIndex = (u8[at + 2] >> 2) & 3, padding = (u8[at + 2] >> 1) & 1;
    if (version === 1 || layer === 4 || bitrate === 0 || bitrate === 15 || rateIndex === 3) return null;
    const rate = MPEG_RATES[rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const kbps = MPEG_KBPS[version === 3 ? 1 : 2][layer - 1][bitrate];
    const length = layer === 1 ? (Math.floor(12000 * kbps / rate) + padding) * 4
      : Math.floor((layer === 3 && version !== 3 ? 72000 : 144000) * kbps / rate) + padding;
    return { rate, length, key: `${version}.${layer}.${rateIndex}`,
      format: `MP${layer} (MPEG-${version === 3 ? '1' : version === 2 ? '2' : '2.5'})` };
  }

  // AAC's sampling frequency index (ISO/IEC 14496-3, 1.6.3.4).
  const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  // ADTS frame header at `at`: { core, aot, length, key } or null.
  function adtsFrame(u8, at) {
    if (at + 7 > u8.length || u8[at] !== 0xff || (u8[at + 1] & 0xf6) !== 0xf0) return null;
    const aot = (u8[at + 2] >> 6) + 1, index = (u8[at + 2] >> 2) & 15;
    const length = ((u8[at + 3] & 3) << 11) | (u8[at + 4] << 3) | (u8[at + 5] >> 5);
    if (index >= AAC_RATES.length || length < 7) return null;
    return { core: AAC_RATES[index], aot, length, key: `${aot}.${index}` };
  }

  // The rate an AAC stream decodes at. HE-AAC (SBR) decodes at twice the
  // rate of its AAC core. An AudioSpecificConfig of object type 5 or 29, or
  // one with the backward-compatible SBR extension, says so (the extension
  // rate). Otherwise the stream may still carry SBR without saying so
  // ("implicit" signalling, the only kind ADTS has), which a decoder finds
  // in the first frame: FFmpeg, and so Chromium, then outputs twice the
  // core rate. SBR needs a core of 24 kHz or less, so such a core rate is
  // ambiguous: it is decoded at twice the core rate. A plain AAC-LC file at
  // that rate is then upsampled by the browser, as every file was before,
  // and nothing is lost; the opposite choice would cut an HE-AAC file's
  // band in half.
  function aacRate(core, aot, explicit = null) {
    if (explicit) return { rate: explicit, note: 'HE-AAC (SBR), at its output rate' };
    if (aot === 2 && core <= 24000) return { rate: 2 * core, note: `AAC with a ${core} Hz core, which may carry SBR (HE-AAC): decoded at twice that rate` };
    return { rate: core, note: '' };
  }

  // The AudioSpecificConfig (ISO/IEC 14496-3, 1.6.2.1): the core rate, the
  // object type and an explicitly signalled SBR rate.
  function readAsc(bytes) {
    let bit = 0;
    const bits = (n) => {
      let v = 0;
      for (let i = 0; i < n; i++, bit++) {
        if (bit >> 3 >= bytes.length) throw new RangeError('short AudioSpecificConfig');
        v = v * 2 + ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
      }
      return v;
    };
    const objectType = () => { const t = bits(5); return t === 31 ? 32 + bits(6) : t; };
    const frequency = () => { const i = bits(4); return i === 15 ? bits(24) : AAC_RATES[i] || 0; };
    let aot = objectType();
    const core = frequency(), channels = bits(4);
    let explicit = null, noSbr = false;
    if (aot === 5 || aot === 29) {
      explicit = frequency();
      aot = objectType();
    } else if ((aot === 2 || aot === 4) && channels !== 0) {
      // GASpecificConfig (no program config element): frameLengthFlag,
      // dependsOnCoreCoder (and its delay), extensionFlag; then a
      // backward-compatible SBR extension may follow.
      bits(1);
      if (bits(1)) bits(14);
      bits(1);
      if (bytes.length * 8 - bit >= 16 && bits(11) === 0x2b7 && objectType() === 5) {
        if (bits(1)) explicit = frequency(); else noSbr = true;
      }
    }
    return { core, aot, explicit, noSbr };
  }
  function ascRate(bytes, format) {
    const asc = readAsc(bytes);
    const { rate, note } = asc.noSbr ? { rate: asc.core, note: '' } : aacRate(asc.core, asc.aot, asc.explicit);
    return result(rate, format, note);
  }

  // A run of MPEG audio or ADTS frames near the start: the first frame whose
  // two successors (or the end of the file) follow where its length says.
  function frames(u8, from) {
    const limit = Math.min(u8.length - 4, from + 65536);
    for (let at = from; at <= limit; at++) {
      if (u8[at] !== 0xff) continue;
      for (const read of [mpegFrame, adtsFrame]) {
        const first = read(u8, at);
        if (!first) continue;
        let ok = true;
        for (let k = 0, next = at + first.length; k < 2 && ok && next < u8.length; k++) {
          const frame = read(u8, next);
          ok = !!frame && frame.key === first.key;
          if (ok) next += frame.length;
        }
        if (!ok) continue;
        if (read === mpegFrame) return result(first.rate, first.format);
        const { rate, note } = aacRate(first.core, first.aot);
        return result(rate, 'AAC (ADTS)', note);
      }
    }
    return null;
  }

  // Ogg: the first packet of the first page names the codec.
  function ogg(u8) {
    if (u8.length < 28) return null;
    const at = 27 + u8[26];
    const head = (s) => s.split('').every((c, i) => u8[at + i] === c.charCodeAt(0));
    if (head('\x01vorbis')) return result(u32le(u8, at + 12), 'Ogg Vorbis');
    if (head('OpusHead')) return result(48000, 'Ogg Opus', 'Opus decodes at 48 kHz');
    if (head('\x7fFLAC') && tag(u8, at + 9) === 'fLaC') return flac(u8, at + 9, 'Ogg FLAC');
    return null;
  }

  // MP4, M4A and MOV: the first sound track's sample entry, located by
  // video.js. Its rate field is a 16.16 number (sound description versions
  // 0 and 1; version 2 holds a float64), with the codec's own boxes after.
  const PCM_ENTRIES = ['sowt', 'twos', 'lpcm', 'raw ', 'in24', 'in32', 'fl32', 'fl64', 'ipcm', 'fpcm', 'alaw', 'ulaw', '.mp3', 'alac'];
  function mp4(u8) {
    const video = typeof TF2Video !== 'undefined' ? TF2Video
      : typeof require === 'function' ? require('./video.js') : null;
    if (!video) return null;
    const movie = video.parse(u8, { audio: false });
    const track = movie && movie.tracks.find(t => t.handler === 'soun' && t.stsd);
    if (!track) return null;
    const entry = track.stsd.body + 8, body = entry + 8, end = Math.min(u8.length, entry + u32be(u8, entry));
    if (body + 28 > end) return null;
    const version = (u8[body + 8] << 8) | u8[body + 9];
    const field = version === 2 ? new DataView(u8.buffer, u8.byteOffset + body + 32, 8).getFloat64(0) : u32be(u8, body + 24) / 65536;
    const boxesAt = body + (version === 2 ? 64 : version === 1 ? 44 : 28);
    // A child box of the entry (inside 'wave' in QuickTime files): its body.
    const child = (type) => {
      for (let at = boxesAt; at + 8 <= end; at++) if (tag(u8, at + 4) === type && u32be(u8, at) >= 8 && at + u32be(u8, at) <= end) return at + 8;
      return -1;
    };
    const container = movie.container === 'mov' ? 'MOV' : 'MP4';
    const fallback = (format) => result(field || track.timescale, `${container} ${format}`);
    switch (track.format) {
      case 'Opus': return result(48000, `${container} Opus`, 'Opus decodes at 48 kHz');
      case 'fLaC': { const at = child('dfLa'); return at < 0 ? fallback('FLAC') : result(streamInfoRate(u8, at + 8), `${container} FLAC`); }
      case 'mp4a': {
        const at = child('esds');
        const asc = at < 0 ? null : decoderConfig(u8, at + 4, end);
        if (asc && asc.bytes && (asc.oti === 0x40 || (asc.oti >= 0x66 && asc.oti <= 0x68))) return ascRate(asc.bytes, `${container} AAC`);
        return fallback(asc && (asc.oti === 0x69 || asc.oti === 0x6b) ? 'MP3' : 'audio');
      }
      default: return PCM_ENTRIES.includes(track.format) ? fallback(track.format.trim()) : null;
    }
  }

  // The esds box's ES_Descriptor: its object type and DecoderSpecificInfo.
  function decoderConfig(u8, at, end) {
    const descriptor = () => {
      const type = u8[at++];
      let size = 0;
      for (let i = 0; i < 4; i++) { const b = u8[at++]; size = size * 128 + (b & 127); if (!(b & 128)) break; }
      return { type, size };
    };
    if (descriptor().type !== 3) return null;
    const flags = u8[at + 2];
    at += 3;
    if (flags & 0x80) at += 2;
    if (flags & 0x40) at += 1 + u8[at];
    if (flags & 0x20) at += 2;
    if (descriptor().type !== 4) return null;
    const oti = u8[at];
    at += 13;
    if (at >= end) return { oti, bytes: null };
    const info = descriptor();
    return info.type === 5 ? { oti, bytes: u8.subarray(at, Math.min(end, at + info.size)) } : { oti, bytes: null };
  }

  function read(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 12) return null;
    const head = tag(u8, 0);
    if (['RIFF', 'RF64', 'BW64'].includes(head) && tag(u8, 8) === 'WAVE') return wav(u8);
    if (head === 'OggS') return ogg(u8);
    if (head === 'FORM' && ['AIFF', 'AIFC'].includes(tag(u8, 8))) return aiff(u8);
    if (head === '\x1aE\xdf\xa3') return null;   // WebM / Matroska: not read
    const audio = afterId3(u8);
    if (tag(u8, audio) === 'fLaC') return flac(u8, audio);
    if (audio === 0) {
      let movie = null;
      try { movie = mp4(u8); } catch (error) { movie = null; }
      if (movie) return movie;
      if (['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(tag(u8, 4))) return null;
    }
    return frames(u8, audio);
  }

  // Whether OfflineAudioContext takes this rate (the standard guarantees
  // 8 to 96 kHz; Chromium takes 3 to 768 kHz).
  function offlineContext(rate) {
    const Offline = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
    if (!Offline) throw new Error('this browser has no OfflineAudioContext');
    return new Offline(1, 1, rate);
  }

  async function decode(data, { deviceContext, again = null } = {}) {
    let info = null, why = '';
    try { info = read(new Uint8Array(data)); } catch (error) { why = `its header could not be read (${error.message})`; }
    if (!info && !why) why = 'its sample rate could not be read from its header';
    if (info) {
      let context = null;
      try { context = offlineContext(info.rate); } catch (error) { why = `${info.rate.toLocaleString('en-US')} Hz is a rate this browser cannot decode at (${error.message})`; }
      if (context) {
        try {
          const buffer = await context.decodeAudioData(again ? data : data.slice(0));
          return { buffer, info, native: true, why: '' };
        } catch (error) {
          why = `the decode at ${info.rate.toLocaleString('en-US')} Hz failed (${error && error.message || error})`;
          if (again) data = await again();
        }
      }
    }
    const buffer = await deviceContext().decodeAudioData(data);
    return { buffer, info, native: false, why };
  }

  const TF2FileRate = { read, decode, readAsc };
  if (typeof window !== 'undefined') window.TF2FileRate = TF2FileRate;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2FileRate;
})();
