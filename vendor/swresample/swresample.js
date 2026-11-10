/* TF2 Voice Emulator, vendor/swresample/swresample.js: the 24000 to 44100 Hz
 * step of Steam's voice decoder, as FFmpeg's libswresample does it.
 *
 * This file is a modified version of parts of FFmpeg's libswresample and
 * libavutil: translated to JavaScript on 2026-11-10 for the TF2 Voice Emulator
 * from FFmpeg n8.1.2 (libswresample/swresample.c, resample.c,
 * resample_template.c, audioconvert.c, x86/resample.asm and
 * libavutil/mathematics.c). Only the path for mono 16-bit samples from 24000
 * to 44100 Hz at the library's default settings is kept. It is distributed
 * under the GNU Lesser General Public License, version 2.1 or later, like the
 * code it comes from: see COPYING.LGPLv2.1 and README.md in this folder. The
 * notices of the files it comes from follow, as they stand there.
 *
 * ---- libswresample/resample.c (resample_template.c, resample_dsp.c and
 * ---- audioconvert.c carry the same lines, with "Copyright (c) 2006 Michael
 * ---- Niedermayer" in audioconvert.c and no Bessel line in the others)
 *
 * audio resampling
 * Copyright (c) 2004-2012 Michael Niedermayer <michaelni@gmx.at>
 * bessel function: Copyright (c) 2006 Xiaogang Zhang
 *
 * This file is part of FFmpeg.
 *
 * FFmpeg is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FFmpeg is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with FFmpeg; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 *
 * ---- libswresample/swresample.c
 *
 * Copyright (C) 2011-2013 Michael Niedermayer (michaelni@gmx.at)
 *
 * This file is part of libswresample
 *
 * libswresample is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * libswresample is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with libswresample; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 *
 * ---- libswresample/x86/resample.asm
 *
 ;******************************************************************************
 ;* Copyright (c) 2012 Michael Niedermayer
 ;* Copyright (c) 2014 James Almer <jamrial <at> gmail.com>
 ;* Copyright (c) 2014 Ronald S. Bultje <rsbultje@gmail.com>
 ;*
 ;* This file is part of FFmpeg.
 ;*
 ;* FFmpeg is free software; you can redistribute it and/or
 ;* modify it under the terms of the GNU Lesser General Public
 ;* License as published by the Free Software Foundation; either
 ;* version 2.1 of the License, or (at your option) any later version.
 ;*
 ;* FFmpeg is distributed in the hope that it will be useful,
 ;* but WITHOUT ANY WARRANTY; without even the implied warranty of
 ;* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 ;* Lesser General Public License for more details.
 ;*
 ;* You should have received a copy of the GNU Lesser General Public
 ;* License along with FFmpeg; if not, write to the Free Software
 ;* Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 ;******************************************************************************
 *
 * ---- libavutil/mathematics.c
 *
 * Copyright (c) 2005-2012 Michael Niedermayer <michaelni@gmx.at>
 *
 * This file is part of FFmpeg.
 *
 * FFmpeg is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FFmpeg is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with FFmpeg; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 *
 * ---- libavutil/mathematics.c, above av_bessel_i0 (the bank below was
 * ---- computed with it; the function itself is in tests/swresample/bank.mjs)
 *
 * 0th order modified bessel function of the first kind.
 * Algorithm taken from the Boost project, source:
 * https://searchcode.com/codesearch/view/14918379/
 * Use, modification and distribution are subject to the
 * Boost Software License, Version 1.0 (see notice below).
 * Boost Software License - Version 1.0 - August 17th, 2003
Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
 *
 * ---- end of the upstream notices
 *
 * What it does. Steam's decoder gives each packet's 24 kHz samples to
 * libswresample (defaults: filter size 32, exact rational, Kaiser window with
 * beta 9) and calls it three times: ask the upper bound, convert, and convert
 * again with no input. packet() is those three calls.
 *
 * - Float inside: in, x = s / 32768; out, clip16(round-half-even(y * 32768)).
 * - The bank: 147 phases of 32 float taps (44100/24000 is 147/80). It is
 *   stored below as base64, not computed here, because Math.sin is not the
 *   same function in every browser; tests/swresample/bank.mjs computes it and
 *   tests/swresample.verify.mjs checks it.
 * - Output k is phase 80k mod 147 against the 32 inputs from floor(80k/147)-15.
 *   It is made as soon as input floor(80k/147)+16 is in.
 * - The start: the samples before input 0 are its mirror (x[-n] = x[n]), set
 *   once 33 inputs have arrived (invert_initial_buffer).
 * - The flush: the first convert with no input in a stream's life adds
 *   (min(held, 32) + 1) >> 1 samples after the last, as its mirror
 *   (resample_flush); held is the count of inputs the library still holds,
 *   31 after any packet that gave output, so 16. They stay in the stream.
 * - The kernel: on x86 the library picks an assembly loop by the processor;
 *   the four orders of the sum are below (KERNELS). Each step is rounded to a
 *   32-bit float; fma3 rounds once per multiply-add, emulated exactly.
 *
 * Interface: createResampler({ kernel }) -> { packet(Int16Array) -> Int16Array,
 * reset(), kernel, bufferSize }. reset() is a new stream (a new speaker, or a
 * voice reset). bufferSize is the length of the input buffer held, for tests.
 * Also exported, for tests: bank() (a copy of the 4704 floats) and fma32(a,
 * b, c), the fused multiply-add of the fma3 kernel.
 */
(function (root) {
  'use strict';

  const KERNELS = ['fma3', 'avx', 'sse', 'c'];
  const DEFAULT_KERNEL = 'fma3';
  const IN_RATE = 24000, OUT_RATE = 44100;
  const TAPS = 32, PHASES = 147, STEP = 80; // 44100/24000 = 147/80
  const CENTER = 15;                        // (TAPS - 1) >> 1
  const fround = Math.fround;

  // The 147 x 32 floats, little-endian, phase by phase. SHA-256 of the bytes:
  // 318831365a80e9e689d9f730e975fc5713aeafacb5ead762a9b52a95802f867e
  const BANK_BASE64 = [
    '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',
  ].join('');

  function decodeBank(b64) {
    const map = new Int16Array(128).fill(-1);
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < 64; i++) map[abc.charCodeAt(i)] = i;
    const bytes = new Uint8Array(TAPS * PHASES * 4);
    let n = 0, acc = 0, bits = 0;
    for (let i = 0; i < b64.length; i++) {
      const v = map[b64.charCodeAt(i)];
      if (v < 0) continue; // padding
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; bytes[n++] = (acc >> bits) & 255; }
    }
    if (n !== bytes.length) throw new Error('swresample: the stored bank is damaged');
    const dv = new DataView(bytes.buffer);
    const bank = new Float32Array(TAPS * PHASES);
    for (let i = 0; i < bank.length; i++) bank[i] = dv.getFloat32(4 * i, true);
    return bank;
  }
  const BANK = decodeBank(BANK_BASE64);

  // round(a * b + c) to a float with one rounding, as vfmadd231ps does, for
  // floats a, b, c. a * b is exact in a double (24 + 24 bits). The double sum
  // s can be off the true sum; that matters only when s lies exactly halfway
  // between two floats (25 significant bits, found by Veltkamp's split), and
  // then the error of the sum (two-sum) says which neighbour is nearer.
  function fma(a, b, c) {
    const p = a * b;
    const s = p + c;
    const r = fround(s);
    if (r === s) return r;
    const t = s * 268435457; // 2^28 + 1
    if (t - (t - s) !== s) return r;
    const v = s - p;
    const e = (p - (s - v)) + (c - v);
    if (e === 0) return r;
    const o = 2 * s - r; // the other neighbour, exact
    return (e > 0) === (o > r) ? o : r;
  }

  // The dot product of the 32 inputs from x[i] with the phase from h[j], in
  // each kernel's order. All values are floats held in doubles.

  // fma3 (x86/resample.asm, INIT_YMM fma3): 8 lanes, tap j into lane j mod 8,
  // fmaddps; then lanes 0+4 .. 3+7, then (04)+(26) and (15)+(37), then those.
  function dotFma3(x, i, h, j) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0, a7 = 0;
    for (let k = 0; k < TAPS; k += 8) {
      a0 = fma(x[i + k], h[j + k], a0);
      a1 = fma(x[i + k + 1], h[j + k + 1], a1);
      a2 = fma(x[i + k + 2], h[j + k + 2], a2);
      a3 = fma(x[i + k + 3], h[j + k + 3], a3);
      a4 = fma(x[i + k + 4], h[j + k + 4], a4);
      a5 = fma(x[i + k + 5], h[j + k + 5], a5);
      a6 = fma(x[i + k + 6], h[j + k + 6], a6);
      a7 = fma(x[i + k + 7], h[j + k + 7], a7);
    }
    const b0 = fround(a0 + a4), b1 = fround(a1 + a5), b2 = fround(a2 + a6), b3 = fround(a3 + a7);
    return fround(fround(b0 + b2) + fround(b1 + b3));
  }

  // avx (INIT_YMM avx): the same lanes and order, mulps then addps.
  function dotAvx(x, i, h, j) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0, a7 = 0;
    for (let k = 0; k < TAPS; k += 8) {
      a0 = fround(a0 + fround(x[i + k] * h[j + k]));
      a1 = fround(a1 + fround(x[i + k + 1] * h[j + k + 1]));
      a2 = fround(a2 + fround(x[i + k + 2] * h[j + k + 2]));
      a3 = fround(a3 + fround(x[i + k + 3] * h[j + k + 3]));
      a4 = fround(a4 + fround(x[i + k + 4] * h[j + k + 4]));
      a5 = fround(a5 + fround(x[i + k + 5] * h[j + k + 5]));
      a6 = fround(a6 + fround(x[i + k + 6] * h[j + k + 6]));
      a7 = fround(a7 + fround(x[i + k + 7] * h[j + k + 7]));
    }
    const b0 = fround(a0 + a4), b1 = fround(a1 + a5), b2 = fround(a2 + a6), b3 = fround(a3 + a7);
    return fround(fround(b0 + b2) + fround(b1 + b3));
  }

  // sse (INIT_XMM sse): 4 lanes, tap j into lane j mod 4, mulps then addps;
  // then 0+2 and 1+3, then those.
  function dotSse(x, i, h, j) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = 0; k < TAPS; k += 4) {
      a0 = fround(a0 + fround(x[i + k] * h[j + k]));
      a1 = fround(a1 + fround(x[i + k + 1] * h[j + k + 1]));
      a2 = fround(a2 + fround(x[i + k + 2] * h[j + k + 2]));
      a3 = fround(a3 + fround(x[i + k + 3] * h[j + k + 3]));
    }
    return fround(fround(a0 + a2) + fround(a1 + a3));
  }

  // c (resample_template.c, resample_common): even taps and odd taps, multiply
  // then add; then the two.
  function dotC(x, i, h, j) {
    let v = 0, v2 = 0;
    for (let k = 0; k < TAPS; k += 2) {
      v = fround(v + fround(x[i + k] * h[j + k]));
      v2 = fround(v2 + fround(x[i + k + 1] * h[j + k + 1]));
    }
    return fround(v + v2);
  }

  const DOTS = { fma3: dotFma3, avx: dotAvx, sse: dotSse, c: dotC };

  // float to 16-bit: av_clip_int16(lrintf(y * 32768)), lrintf rounding half to even.
  function toS16(y) {
    const v = y * 32768; // exact: a power of two
    let r = Math.round(v);
    if (r - v === 0.5 && (r & 1)) r -= 1;
    return r > 32767 ? 32767 : r < -32768 ? -32768 : r;
  }

  function createResampler(opts) {
    const kernel = opts && opts.kernel !== undefined ? opts.kernel : DEFAULT_KERNEL;
    if (!KERNELS.includes(kernel)) throw new RangeError(`swresample: unknown kernel ${kernel}`);
    const dot = DOTS[kernel];

    // The stream held: buf[n] is input (start + n), for n < len. Inputs -15 to
    // -1 are the mirror. The next output's window starts at pos - 15, phase ph.
    let buf, start, len, pos, ph, inverted, flushed;

    function reset() {
      buf = new Float32Array(2048);
      start = -CENTER; len = CENTER;
      pos = 0; ph = 0;
      inverted = false; flushed = false;
    }

    function room(n) {
      if (len + n <= buf.length) return;
      const next = new Float32Array(len + n);
      next.set(buf.subarray(0, len));
      buf = next;
    }

    // invert_initial_buffer: once 33 inputs are in, inputs -1 to -15 mirror 1 to 15.
    function invert() {
      if (inverted || start + len < TAPS + 1) return;
      for (let n = 1; n <= CENTER; n++) buf[CENTER - n] = buf[CENTER + n];
      inverted = true;
    }

    // Every output whose 32 inputs are in.
    function produce(out, at) {
      if (!inverted) return at;
      const end = start + len;
      let p = pos, f = ph;
      while (p + TAPS - CENTER <= end) {
        out[at++] = toS16(dot(buf, p - CENTER - start, BANK, f * TAPS));
        f += STEP;
        if (f >= PHASES) { f -= PHASES; p++; }
      }
      pos = p; ph = f;
      return at;
    }

    function packet(samples) {
      if (Object.prototype.toString.call(samples) !== '[object Int16Array]') {
        throw new TypeError('swresample: packet() takes an Int16Array');
      }
      // Drop the inputs no later output needs.
      if (inverted) {
        const drop = pos - CENTER - start;
        if (drop > 0) { buf.copyWithin(0, drop, len); len -= drop; start += drop; }
      }
      const n = samples.length;
      room(n + TAPS);
      for (let k = 0; k < n; k++) buf[len + k] = samples[k] / 32768;
      len += n;
      // At most every input held, and the flush, can give output (the
      // library's upper bound is higher still, so it never limits).
      const out = new Int16Array(Math.ceil((start + len + TAPS - pos) * PHASES / STEP) + 2);
      // swr_convert with the packet.
      invert();
      let at = produce(out, 0);
      // swr_convert with no input: the first time in a stream's life, flush.
      if (!flushed) {
        const held = inverted ? start + len - (pos - CENTER) : start + len;
        const reflection = (Math.min(held, TAPS) + 1) >> 1;
        for (let j = 0; j < reflection; j++) buf[len + j] = buf[len - 1 - j];
        len += reflection;
        flushed = true;
        invert();
        at = produce(out, at);
      }
      return out.slice(0, at);
    }

    reset();
    return {
      packet,
      reset,
      kernel,
      get bufferSize() { return buf.length; },
    };
  }

  const api = { KERNELS, DEFAULT_KERNEL, IN_RATE, OUT_RATE, TAPS, PHASES, BANK_BASE64, createResampler,
    bank: () => BANK.slice(), fma32: fma };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TF2Swresample = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
