// The arithmetic of the game's build of Speex 1.0.2, stated as changes to the
// library's C source (docs/work-orders/W3-18-speex-exact.md, "The 25 places").
//
// The game's vaudio_speex module was compiled with the compiler's fast
// floating-point model for SSE2: some sums are added eight at a time, some
// double expressions are computed in float, two divisions became
// multiplications, a few additions are re-ordered, and cos, acos, exp and log
// are partly the C runtime's float routines. Strict C of the unchanged source
// computes something else in 25 places of 7 files. Each change below rewrites
// one of them in plain C, so that a strict compiler (no contraction, no
// fast-math) computes what the module computes. vsx.h holds the eight-at-a-time
// sum and the math functions' prototypes; vsx_math.c the functions.
//
// Each change is [name, file, old text, new text, how many times the old text
// occurs]; a change with one name may have several entries. patchLibspeex copies
// a checkout's libspeex/ to a new folder and applies them, stopping if an old
// text does not occur exactly as often as stated. Names given in `without` are
// left out (the tests' mutations): node tests/speex102/build.mjs --without=k3.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The seven files that get `#include "vsx.h"`.
export const PATCHED_FILES = ['lpc.c', 'nb_celp.c', 'ltp.c', 'cb_search.c', 'quant_lsp.c', 'filters.c', 'vq.c'];

export const CHANGES = [
  ['wld-odd', 'lpc.c', 'if (i % 2) lpc[j] += lpc[j] * r;',
    'if (i % 2) lpc[j] = (r + 1.0f) * lpc[j];'],
  ['wld-error', 'lpc.c', 'error *= 1.0 - r * r;',
    'error = error * (1.0f - r * r);'],
  ['autocorr', 'lpc.c', `   while (lag--) {
      for (i = lag, d = 0; i < n; i++) d += x[i] * x[i-lag];
      ac[lag] = d;
   }`,
    `   float t[640];
   while (lag--) {
      for (i = lag; i < n; i++) t[i-lag] = x[i] * x[i-lag];
      d = vsx_sum8(t, n-lag);
      ac[lag] = d;
   }`],
  ['interp-whole', 'nb_celp.c', 'st->interp_lsp[i] = .375*st->old_lsp[i] + .625*st->lsp[i];',
    'st->interp_lsp[i] = .375f*st->old_lsp[i] + .625f*st->lsp[i];'],
  ['acosf', 'nb_celp.c', 'st->lsp[i] = acos(st->lsp[i]);',
    'st->lsp[i] = vsx_acosf(st->lsp[i]);', 2],
  ['cosf', 'nb_celp.c', 'st->interp_lsp[i] = cos(st->interp_lsp[i]);',
    'st->interp_lsp[i] = vsx_cosf(st->interp_lsp[i]);', 2],
  ['cosf', 'nb_celp.c', 'st->interp_qlsp[i] = cos(st->interp_qlsp[i]);',
    'st->interp_qlsp[i] = vsx_cosf(st->interp_qlsp[i]);', 2],
  ['qe-log', 'nb_celp.c', 'int qe = (int)(floor(3.5*log(ol_gain)));',
    'int qe = (int)(floor(3.5*vsx_log(ol_gain)));'],
  ['qe-exp', 'nb_celp.c', 'ol_gain = exp(qe/3.5);',
    'ol_gain = vsx_exp(qe*0.2857142857142857);', 2],
  ['ener-logf', 'nb_celp.c', 'ener=log(ener);',
    'ener=vsx_logf(ener);'],
  ['ener-expf', 'nb_celp.c', 'ener=exp(ener);',
    'ener=vsx_expf(ener);'],
  ['dec-ener', 'nb_celp.c', 'ener = ol_gain*exp(exc_gain_quant_scal3[q_energy]);',
    'ener = ol_gain*vsx_exp(exc_gain_quant_scal3[q_energy]);'],
  ['dec-ener', 'nb_celp.c', 'ener = ol_gain*exp(exc_gain_quant_scal1[q_energy]);',
    'ener = ol_gain*vsx_exp(exc_gain_quant_scal1[q_energy]);'],
  ['k3', 'nb_celp.c', 'k3=(1-(1-r*k1)/(1-r*k2))/r;',
    'k3=(1-(1-r*k1)/(1-r*k2))*1.1111111640930176f;', 2],
  ['window', 'nb_celp.c', 'st->window[i]=.54-.46*cos(M_PI*i/part1);',
    'st->window[i]=.54-.46*vsx_cos(M_PI*i/part1);'],
  ['window', 'nb_celp.c', 'st->window[part1+i]=.54+.46*cos(M_PI*i/part2);',
    'st->window[part1+i]=.46*vsx_cos(M_PI*i/part2)+.54;'],
  ['lagwindow', 'nb_celp.c', 'st->lagWindow[i]=exp(-.5*sqr(2*M_PI*st->lag_factor*i));',
    'st->lagWindow[i]=vsx_exp((((double)i*(double)i)*-19.739208802178716)*((double)st->lag_factor*(double)st->lag_factor));'],
  ['olp-energy0', 'ltp.c', '   energy[0]=inner_prod(sw-start, sw-start, len);',
    `   {
      float s1=0,s2=0,s3=0,s4=0;
      float *xx=sw-start;
      for (i=0;i<len;i+=4)
      {
         s1 += xx[i]*xx[i];
         s2 += xx[i+1]*xx[i+1];
         s3 += xx[i+2]*xx[i+2];
         s4 += xx[i+3]*xx[i+3];
      }
      energy[0]=(s4+s3)+(s2+s1);
   }`],
  ['gain-first', 'ltp.c', `         sum += C[0]*g0;
         sum += C[1]*g1;
         sum += C[2]*g2;`,
    `         sum = C[1]*g1;
         sum += C[0]*g0;
         sum += C[2]*g2;`],
  ['gain-halves', 'ltp.c', `         sum -= .5*C[6]*g0*g0;
         sum -= .5*C[7]*g1*g1;
         sum -= .5*C[8]*g2*g2;`,
    `         sum -= (C[6]*.5f)*g0*g0;
         sum -= (C[7]*.5f)*g1*g1;
         sum -= (C[8]*.5f)*g2*g2;`],
  ['err2', 'ltp.c', `   for (i=0;i<nsf;i++)
      err2+=(target[i]-gain[2]*x[0][i]-gain[1]*x[1][i]-gain[0]*x[2][i])
      * (target[i]-gain[2]*x[0][i]-gain[1]*x[1][i]-gain[0]*x[2][i]);`,
    `   {
      float tt[640];
      for (i=0;i<nsf;i++)
      {
         float d=target[i]-gain[2]*x[0][i]-gain[1]*x[1][i]-gain[0]*x[2][i];
         tt[i]=d*d;
      }
      err2=vsx_sum8(tt,nsf);
   }`],
  ['cb-energy', 'cb_search.c', `      E[i]=0;
      for(j=0;j<subvect_size;j++)
         E[i]+=res[j]*res[j];`,
    `      {
         float tt[64];
         for(j=0;j<subvect_size;j++)
            tt[j]=res[j]*res[j];
         E[i]=vsx_sum8(tt,subvect_size);
      }`],
  ['cb-err', 'cb_search.c', `            err=odist[j];
            for (m=i*subvect_size;m<(i+1)*subvect_size;m++)
               err += t[m]*t[m];`,
    `            {
               float tt[64];
               int done;
               for (m=0;m<subvect_size;m++)
                  tt[m]=t[i*subvect_size+m]*t[i*subvect_size+m];
               err=odist[j];
               if (subvect_size>=8)
                  err=err+vsx_sum8_head(tt,subvect_size,&done);
               else
                  done=0;
               for (m=done;m<subvect_size;m++)
                  err=err+tt[m];
            }`],
  ['vq-nbest', 'vq.c', `      float dist=.5*E[i];
      for (j=0;j<len;j++)
         dist -= in[j]**codebook++;
      if (i<N || dist<best_dist[N-1])`,
    `      float dist=.5f*E[i];
      {
         float tt[64];
         int done=0;
         for (j=0;j<len;j++)
            tt[j]=in[j]**codebook++;
         if (len>=8)
            dist=dist-vsx_sum8_head(tt,len,&done);
         for (j=done;j<len;j++)
            dist=dist-tt[j];
      }
      if (i<N || dist<best_dist[N-1])`],
  ['lsp-quant', 'quant_lsp.c', `      dist=0;
      for (j=0;j<nbDim;j++)
      {
         tmp=(x[j]-*ptr++);
         dist+=tmp*tmp;
      }`,
    `      {
         float tt[64];
         for (j=0;j<nbDim;j++)
         {
            tmp=(x[j]-*ptr++);
            tt[j]=tmp*tmp;
         }
         dist=vsx_sum8(tt,nbDim);
      }`],
  ['comb-energy', 'filters.c', `   for (i=0;i<nsf;i++)
      exc_energy+=exc[i]*exc[i];`,
    `   {
      float tt[640];
      for (i=0;i<nsf;i++)
         tt[i]=exc[i]*exc[i];
      exc_energy=vsx_sum8(tt,nsf);
   }`],
  ['comb-g', 'filters.c', `      g = .5*fabs(pitch_gain[0]+pitch_gain[1]+pitch_gain[2] +
      mem->last_pitch_gain[0] + mem->last_pitch_gain[1] + mem->last_pitch_gain[2]);`,
    `      g = ((pitch_gain[0]+pitch_gain[2])+pitch_gain[1]) +
          ((mem->last_pitch_gain[1]+mem->last_pitch_gain[2])+mem->last_pitch_gain[0]);
      g = .5f*(g<0 ? -g : g);`],
  ['comb-energy', 'filters.c', `   for (i=0;i<nsf;i++)
      new_exc_energy+=new_exc[i]*new_exc[i];`,
    `   {
      float tt[640];
      for (i=0;i<nsf;i++)
         tt[i]=new_exc[i]*new_exc[i];
      new_exc_energy=vsx_sum8(tt,nsf);
   }`],
  ['comb-gain', 'filters.c', 'gain = sqrt(exc_energy)/sqrt(.1+new_exc_energy);',
    'gain = (1.0/sqrt(.1+new_exc_energy))*sqrt(exc_energy);'],
];
export const NAMES = [...new Set(CHANGES.map(c => c[0]))];
// The changes that can alter the codec's output on some signal (each fails at
// least one of the seven clips when left out). The other 14 were shown only by
// values read inside the running module, or not at all (the order's table:
// V or N); no output tells them apart, so no test can fail without them.
export const OUTPUT_CHANGES = ['wld-odd', 'wld-error', 'autocorr', 'interp-whole', 'acosf', 'cosf', 'k3', 'olp-energy0',
  'cb-energy', 'cb-err', 'comb-energy'];
export const UNSEEN_CHANGES = NAMES.filter(n => !OUTPUT_CHANGES.includes(n));

// Copies <checkout>/libspeex to `out` (replacing it) with the changes applied,
// apart from those named in `without`.
export function patchLibspeex(checkout, out, without = []) {
  const unknown = without.filter(n => !NAMES.includes(n));
  if (unknown.length) throw new Error(`No change is named ${unknown.join(', ')}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(checkout, 'libspeex'), out, { recursive: true });
  fs.copyFileSync(path.join(here, 'vsx.h'), path.join(out, 'vsx.h'));
  for (const file of PATCHED_FILES) {
    const p = path.join(out, file);
    fs.writeFileSync(p, '#include "vsx.h"\n' + fs.readFileSync(p, 'utf8'));
  }
  for (const [name, file, old, replacement, count = 1] of CHANGES) {
    if (without.includes(name)) continue;
    const p = path.join(out, file), text = fs.readFileSync(p, 'utf8');
    const found = text.split(old).length - 1;
    if (found !== count) throw new Error(`Change ${name}: ${file} has its old text ${found} times, not ${count}`);
    fs.writeFileSync(p, text.split(old).join(replacement));
  }
  return out;
}
// --without=a,b from a command line: the names, and the other arguments.
export function parseWithout(args) {
  const rest = [], without = [];
  for (const a of args) {
    if (a.startsWith('--without=')) without.push(...a.slice(10).split(',').filter(Boolean));
    else rest.push(a);
  }
  return { rest, without };
}
