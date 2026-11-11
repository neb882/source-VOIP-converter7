/*
 * vr12.c -- Voxware MetaVoice VR12 speech decoder (Half-Life "voice_miles").
 *
 * A C port of the decoder half of Mssv12.asi (Miles Sound System ASI
 * plugin, "Voxware MetaVoice VR12 speech codec (1200 bps)", internal version
 * RT.03.01.00), reconstructed from the binary in 2026-09 against the real plugin
 * running as an oracle (3rdparty/vr12/VENDORED.md). Wire format as Half-Life's
 * voice_miles.dll emitted it:
 *
 *   one HL frame = 12 bytes = two codec frames of 6 bytes, each decoding to
 *   180 samples of 16-bit mono at 8 kHz (45 ms per HL frame, 2133 bps on the
 *   wire). A codec frame is at most 41 bits, MSB-padding inside the 6 bytes:
 *
 *     2 bits  type    1 = voiced   : 3 voicing + 7 pitch + 6x4 LSF + 5 gain = 41
 *                     0 = unvoiced :             7 pitch + 6x4 LSF + 5 gain = 38
 *                     2 = silence  :                       2x4 LSF + 5 gain = 15
 *
 * Bits are read LSB-first within each byte. The synthesizer is a harmonic
 * (sinusoidal + noise) vocoder: 10 LSFs from a 6-stage multi-stage VQ, a pitch
 * period, an energy, and a voicing cutoff; harmonics are shaped by the LPC
 * envelope, synthesized per 60-sample subframe by an inverse 256-point FFT of one
 * pitch period followed by cubic time-warp resampling and cross-fade, then passed
 * through an LPC synthesis filter.
 *
 * Numerics follow the original x87 code as closely as reasonable (float storage,
 * double intermediates where the original kept values on the FPU stack); the
 * FFTs are re-implemented from their measured convention rather than transcribed.
 */
#include <math.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

#include "vr12.h"
#include "vr12_tables.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define VR12_NHARM_MAX    90
#define VR12_LPC_ORDER    10
#define VR12_FRAME        180
#define VR12_SUBFRAMES    3
#define VR12_SUBFRAME     60
#define VR12_SYN_ORDER    8
#define VR12_SYN_N        (1 << VR12_SYN_ORDER)   /* 256 */
#define VR12_FFT_MAX      512                      /* the encoder's analysis FFT */

/* MSVC _ftol: truncation toward zero */
static int ftol(double x) { return (int)x; }

/* -------------------------------------------------------------------------- */
/* bit reader (FUN_2660b5fb) -- LSB-first within a byte, over a ring of `size` */
/* bytes. HL only ever hands the decoder one 6-byte frame at a time, so the    */
/* ring never actually wraps, but the arithmetic is kept.                      */
typedef struct {
	const uint8_t *data;
	unsigned size;        /* bytes in the ring */
	unsigned bytepos;
	unsigned bitpos;      /* 0..7 */
} vr12_bits_t;

static unsigned bits_read(vr12_bits_t *b, unsigned nbits)
{
	unsigned mask = (1u << nbits) - 1;
	const uint8_t *p = b->data + b->bytepos;
	unsigned newbit = b->bitpos + nbits;
	unsigned v;

	if (newbit < 9)
	{
		v = (p[0] >> b->bitpos) & mask;
		if (newbit == 8)
		{
			newbit = 0;
			if (++b->bytepos >= b->size)
				b->bytepos = 0;
		}
	}
	else
	{
		unsigned oldbit = b->bitpos;
		v = (uint8_t)(p[0] >> oldbit);
		if (++b->bytepos >= b->size)
			b->bytepos = 0;
		p = b->data + b->bytepos;
		v |= (uint8_t)((p[0] & (mask >> (8 - oldbit))) << (8 - oldbit));
		newbit -= 8;
	}
	b->bitpos = newbit;
	return v & 0xff;
}

/* -------------------------------------------------------------------------- */
/* Park-Miller minimal standard generator, exactly as the plugin computes it   */
/* (FUN_2660d540). Returns the new seed (31-bit).                              */
static uint32_t vr12_rand(uint32_t *seed)
{
	const uint32_t mul = 0x41a7;
	uint32_t s0 = *seed & 0xffff;
	uint32_t s1 = (uint32_t)((int32_t)*seed >> 16);
	uint32_t lo = ((mul * s1) << 17 >> 1) + mul * s0;
	uint32_t hi = ((mul * s1) >> 15) + (lo >> 31);
	uint32_t x;

	lo = (lo << 1) >> 1;
	x = hi + lo;
	x = x + (x >> 31);
	x = (x << 1) >> 1;
	*seed = x;
	return x;
}

/* -------------------------------------------------------------------------- */
/* FFTs. The plugin's library computes plain unnormalised DFTs:                */
/*   rfft(x, order):  N = 2^order real samples in x[0..N-1] -> bins 0..N/2 as   */
/*                    (re, im) pairs in x[0..N+1] (DC and Nyquist imaginary 0)  */
/*   irfft(x, order): the inverse of that, times N.                            */
static void cfft(float *re, float *im, int n, int inverse)
{
	int i, j, k, m;
	double sgn = inverse ? 1.0 : -1.0;

	/* bit reversal */
	for (i = 1, j = 0; i < n; i++)
	{
		int bit = n >> 1;
		for (; j & bit; bit >>= 1)
			j ^= bit;
		j ^= bit;
		if (i < j)
		{
			float t;
			t = re[i]; re[i] = re[j]; re[j] = t;
			t = im[i]; im[i] = im[j]; im[j] = t;
		}
	}
	for (m = 2; m <= n; m <<= 1)
	{
		double ang = sgn * 2.0 * M_PI / m;
		for (k = 0; k < n; k += m)
		{
			for (j = 0; j < m / 2; j++)
			{
				double wr = cos(ang * j), wi = sin(ang * j);
				int a = k + j, b = k + j + m / 2;
				double tr = re[b] * wr - im[b] * wi;
				double ti = re[b] * wi + im[b] * wr;
				re[b] = (float)(re[a] - tr);
				im[b] = (float)(im[a] - ti);
				re[a] = (float)(re[a] + tr);
				im[a] = (float)(im[a] + ti);
			}
		}
	}
}

static void vr12_rfft(float *x, int order)
{
	int n = 1 << order, i;
	float re[VR12_FFT_MAX], im[VR12_FFT_MAX];

	for (i = 0; i < n; i++) { re[i] = x[i]; im[i] = 0.0f; }
	cfft(re, im, n, 0);
	for (i = 0; i <= n / 2; i++) { x[2 * i] = re[i]; x[2 * i + 1] = im[i]; }
	x[1] = 0.0f;
	x[n + 1] = 0.0f;
}

static void vr12_irfft(float *x, int order)
{
	int n = 1 << order, i;
	float re[VR12_SYN_N], im[VR12_SYN_N];

	for (i = 0; i <= n / 2; i++) { re[i] = x[2 * i]; im[i] = x[2 * i + 1]; }
	im[0] = 0.0f;
	im[n / 2] = 0.0f;
	for (i = n / 2 + 1; i < n; i++) { re[i] = re[n - i]; im[i] = -im[n - i]; }
	cfft(re, im, n, 1);
	for (i = 0; i < n; i++) x[i] = re[i];
}

/* -------------------------------------------------------------------------- */
/* decoder state                                                               */

typedef struct {
	/* quantiser state (FUN_266091bc) */
	uint16_t lsf_idx[6];
	uint16_t voicing_idx, pitch_idx, gain_idx;
	int16_t  frame_type, prev_frame_type;
	float    lsf_prev[VR12_LPC_ORDER];
	float    lsf_cur[VR12_LPC_ORDER];
	uint32_t seed;
	float    gain_floor;
} vr12_quant_t;

typedef struct {
	/* decoded frame parameters (FUN_2660f7f0) */
	float voicing;                 /* 0..1: fraction of the harmonics that are voiced (0 = none) */
	float pitch;                   /* period in samples */
	float gain;                    /* frame energy */
	float lsf[VR12_LPC_ORDER];     /* Hz */
	float amps[VR12_NHARM_MAX];    /* harmonic amplitudes */
} vr12_params_t;

typedef struct {
	/* frame-erasure / comfort-noise substitution state (FUN_2660a59f) */
	int16_t have_frame, had_frame;
	float   gain;
	float   lsf[VR12_LPC_ORDER];
	int16_t ramp;
} vr12_erasure_t;

typedef struct {
	/* synthesis parameter set (FUN_2660fb87 + FUN_266111c0) */
	float pitch, voicing, gain;
	float amps[VR12_NHARM_MAX];
	float lsf[VR12_LPC_ORDER];
	float prev_pitch, prev_voicing, prev_gain;
	float prev_amps[VR12_NHARM_MAX];
	float prev_lsf[VR12_LPC_ORDER];
	int16_t sub_left, sub_count;      /* +0x28, +0x2a */
	int16_t frame_len, nsub;          /* +0x2c, +0x2e */
	float smooth_lsf[VR12_LPC_ORDER]; /* +0x30 */
	int   smooth_count;               /* +0x34 */
} vr12_synparams_t;

typedef struct {
	/* previous decoded parameters (FUN_2660fa30) */
	float pitch, voicing, gain;
	float amps[VR12_NHARM_MAX];
	float lsf[VR12_LPC_ORDER];
} vr12_prevparams_t;

typedef struct {
	/* sinusoidal synthesis state (FUN_26612455) */
	float bufmem[VR12_SYN_N + 4]; /* [0] is buf[-1], then 256 samples, then 3 guard slots (DLL layout: 0x410 bytes) */
	float step;                  /* +0x410: buffer samples per output sample */
	float phase;                 /* +0x414: read position, in periods */
	float phase_acc;             /* +0x418 */
	uint32_t unused_41c;         /* +0x41c: a sub-allocation the decoder never reads */
	uint32_t seed;               /* +0x420 */
} vr12_synth_t;

typedef struct {
	/* LPC synthesis filter state (FUN_26611d4c) */
	float lsf[VR12_LPC_ORDER];
	float mem[VR12_LPC_ORDER];
} vr12_lpcfilt_t;

struct vr12_decoder_s {
	vr12_quant_t      q;
	vr12_erasure_t    er;
	vr12_params_t     p;
	vr12_prevparams_t prev;
	vr12_synparams_t  sp;
	vr12_synth_t      syn;
	vr12_lpcfilt_t    lpc;
	float             timescale;      /* +0x38: 1.0 (warp factor 1.0) */
	uint8_t           need_input;     /* +0x3d */
};

/* -------------------------------------------------------------------------- */
/* frame unpacking (FUN_266089a2)                                              */
static void vr12_unpack(vr12_quant_t *q, vr12_bits_t *b)
{
	int i;

	q->frame_type = (int16_t)bits_read(b, 2);
	if (q->frame_type == 2)
	{
		for (i = 0; i < 2; i++)
			q->lsf_idx[i] = (uint16_t)bits_read(b, 4);
		q->gain_idx = (uint16_t)bits_read(b, 5);
	}
	if (q->frame_type == 1)
	{
		q->voicing_idx = (uint16_t)bits_read(b, 3);
		q->pitch_idx = (uint16_t)bits_read(b, 7);
		for (i = 0; i < 6; i++)
			q->lsf_idx[i] = (uint16_t)bits_read(b, 4);
		q->gain_idx = (uint16_t)bits_read(b, 5);
	}
	if (q->frame_type == 0)
	{
		q->pitch_idx = (uint16_t)bits_read(b, 7);
		for (i = 0; i < 6; i++)
			q->lsf_idx[i] = (uint16_t)bits_read(b, 4);
		q->gain_idx = (uint16_t)bits_read(b, 5);
	}
}

/* number of whole frames in a block of `nbytes` (FUN_26608550) -- only ever
 * used as a "there is at least one frame" check */
static int vr12_count_frames(const uint8_t *data, unsigned nbytes)
{
	unsigned avail = (nbytes - 1) * 8 + 8 - 0 - (8 - 7);   /* read 0.0 .. write (n-1).7 */
	unsigned used = 0;
	int count = 0;
	vr12_bits_t b = { data, nbytes, 0, 0 };

	while (used < avail)
	{
		unsigned t = bits_read(&b, 2);
		unsigned len = t == 2 ? 13 : t == 0 ? 36 : t == 1 ? 39 : 0;
		unsigned k;
		count++;
		/* skip the payload bits */
		for (k = 0; k + 8 <= len; k += 8) bits_read(&b, 8);
		if (k < len) bits_read(&b, len - k);
		used += 2 + len;
	}
	if (avail < used)
		count--;
	return count;
}

/* -------------------------------------------------------------------------- */
/* dequantisation                                                              */

/* number of harmonics below 4 kHz for a pitch period (FUN_2660d460) */
static int vr12_nharm(float pitch)
{
	/* x87: pitch * 0.5 * 0.99609375 stays in extended precision until floor() */
	return ftol(floor((double)pitch * 0.5 * 0.99609375));
}

/* voiced harmonic count (FUN_2660d492) */
static int vr12_nvoiced(float pitch, float voicing)
{
	int n = ftol(floor((double)pitch * 0.5 * 0.99609375));
	return ftol(floor((double)n * (double)voicing + 0.5));
}

/* multi-stage VQ (FUN_2660c50b): sum of `nstage` 10-dim codebook entries, then
 * sort ascending, enforce 0.01 spacing, scale to Hz */
static void vr12_lsf_dequant(const uint16_t *idx, float *lsf, int nstage)
{
	int i, s;

	for (i = 0; i < VR12_LPC_ORDER; i++)
		lsf[i] = 0.0f;
	for (s = 0; s < nstage; s++)
	{
		const float *cb = vr12_lsf_codebooks + s * 160 + idx[s] * VR12_LPC_ORDER;
		for (i = 0; i < VR12_LPC_ORDER; i++)
			lsf[i] = (float)((double)lsf[i] + (double)cb[i]);
	}
	for (i = 1; i < VR12_LPC_ORDER && lsf[i - 1] <= lsf[i]; i++)
		;
	if (i < VR12_LPC_ORDER && lsf[i] < lsf[i - 1])
	{
		/* The original's insertion sort re-reads its key lsf[j-1] from the array on every
		 * comparison, after that slot may already have been overwritten by the shift --
		 * so an out-of-order pair collapses onto the larger value instead of swapping
		 * (e.g. 845.2, 831.8 -> 845.2, 845.2 -> spacing -> 845.2, 885.2). It is a bug, and
		 * it is part of the bitstream's meaning now: every VR12 decoder ever shipped did
		 * this, so a correct sort produces audibly different formants. Reproduced exactly. */
		int j, k;
		for (j = 2; j <= VR12_LPC_ORDER; j++)
		{
			for (k = j - 1; k > 0 && lsf[j - 1] < lsf[k - 1]; k--)
				lsf[k] = lsf[k - 1];
			lsf[k] = lsf[j - 1];
		}
	}
	for (i = 1; i < VR12_LPC_ORDER; i++)
	{
		if ((double)lsf[i] - (double)lsf[i - 1] < (double)0.01f)
			lsf[i] = (float)((double)lsf[i - 1] + (double)0.01f);
	}
	for (i = 0; i < VR12_LPC_ORDER; i++)
		lsf[i] = (float)((double)lsf[i] * 4000.0);
}

/* pitch (FUN_2660b849): 160 * 1.0239...^-idx, clamped, halved above 125 */
static float vr12_pitch_dequant(int idx)
{
	double base;
	float p;
	uint64_t bits = 0x3ff061c44de70272ull;
	memcpy(&base, &bits, 8);
	p = (float)(pow(base, (double)-idx) * 160.0);
	if (p < 8.0f) p = 8.0f;
	if (p > 160.0f) p = 160.0f;
	if (p > 125.0) p = p * 0.5f;
	return p;
}

/* gain (FUN_2660b925 / FUN_2661311c) */
static float vr12_gain_dequant(int idx)
{
	float t;
	if (idx >= 32) idx = 0;
	t = vr12_gain_table[idx];
	return (float)pow(10.0, (double)t);
}

/* voicing (FUN_2660b7a6) */
static float vr12_voicing_dequant(int idx)
{
	return (float)((double)idx * 0.09285714285714285 + 0.05);
}

/* FUN_26608de5 */
static void vr12_dequant(vr12_quant_t *q, vr12_params_t *p)
{
	int i, nh;
	float amp;

	if (q->frame_type == 3)
	{
		p->voicing = 0.0f;
		p->pitch = 125.0f;
		if (q->prev_frame_type != 3)
		{
			for (i = 0; i < VR12_LPC_ORDER; i++)
				q->lsf_cur[i] = (float)((double)q->lsf_prev[i] * (double)0.39999998f + (double)q->lsf_cur[i] * (double)0.6f);
		}
		p->gain = q->gain_floor;
		for (i = 0; i < VR12_LPC_ORDER; i++)
		{
			double r = (double)(int)vr12_rand(&q->seed) * (double)4.656613e-10f - 0.5;
			p->lsf[i] = (float)((r + r) * 50.0 + (double)q->lsf_cur[i]);
		}
		for (i = 1; i < VR12_LPC_ORDER; i++)
		{
			if (p->lsf[i] < p->lsf[i - 1] + 45.0f)
				p->lsf[i] = p->lsf[i - 1] + 45.0f;
		}
	}
	if (q->frame_type == 2)
	{
		p->pitch = 125.0f;
		p->voicing = 0.0f;
		p->gain = vr12_gain_dequant(q->gain_idx);
		vr12_lsf_dequant(q->lsf_idx, p->lsf, 2);
	}
	if (q->frame_type == 1)
	{
		p->pitch = vr12_pitch_dequant(q->pitch_idx);
		p->voicing = vr12_voicing_dequant(q->voicing_idx);
		p->gain = vr12_gain_dequant(q->gain_idx);
		vr12_lsf_dequant(q->lsf_idx, p->lsf, 6);
	}
	if (q->frame_type == 0)
	{
		p->pitch = vr12_pitch_dequant(q->pitch_idx);
		p->voicing = 0.94f;
		p->gain = vr12_gain_dequant(q->gain_idx);
		vr12_lsf_dequant(q->lsf_idx, p->lsf, 6);
	}

	nh = vr12_nharm(p->pitch);
	amp = (float)sqrt(((double)p->gain + (double)p->gain) / (double)nh);
	for (i = 0; i < nh; i++)
		p->amps[i] = amp;
	for (; i < VR12_NHARM_MAX; i++)
		p->amps[i] = 0.0f;

	if (q->frame_type == 3)
		q->gain_floor = q->gain_floor * 0.99f;
	else
	{
		q->gain_floor = (float)((double)q->gain_floor * (double)1.01f + 5.0);
		if (q->prev_frame_type != 999 && p->gain < q->gain_floor)
			q->gain_floor = p->gain;
	}
	q->prev_frame_type = q->frame_type;
	memcpy(q->lsf_prev, p->lsf, sizeof(q->lsf_prev));
}

/* -------------------------------------------------------------------------- */
/* frame erasure substitution (FUN_2660a300)                                   */
static void vr12_erasure(vr12_erasure_t *er, vr12_params_t *p)
{
	int i;

	if (er->have_frame == 0)
	{
		int nh;
		float amp;
		p->gain = er->gain;
		p->pitch = 125.0f;
		p->voicing = 0.0f;
		nh = vr12_nharm(p->pitch);
		amp = (float)sqrt(((double)p->gain + (double)p->gain) / (double)nh);
		for (i = 0; i < nh; i++)
			p->amps[i] = amp;
		for (; i < VR12_NHARM_MAX; i++)
			p->amps[i] = 0.0f;
		for (i = 0; i < VR12_LPC_ORDER; i++)
			p->lsf[i] = er->lsf[i];
		for (i = 1; i < VR12_LPC_ORDER; i++)
		{
			if (p->lsf[i] < p->lsf[i - 1] + 45.0f)
				p->lsf[i] = p->lsf[i - 1] + 45.0f;
		}
	}
	else if (p->voicing == 0.0f)
	{
		for (i = 0; i < VR12_LPC_ORDER; i++)
			er->lsf[i] = (float)((double)er->lsf[i] * (double)0.97f + (double)p->lsf[i] * (double)0.029999971f);
		if (er->gain <= p->gain)
			er->gain = er->gain * 1.01f;
		else
			er->gain = p->gain;
	}
	if (er->have_frame == 1 && er->had_frame == 0)
		er->ramp = 3;
	if (er->ramp > 0)
	{
		int16_t k;
		er->ramp--;
		k = er->ramp;
		for (i = 0; i < VR12_NHARM_MAX; i++)
			p->amps[i] = (float)((double)(3 - k) * (double)0.33333334f * (double)p->amps[i]);
	}
	er->had_frame = er->have_frame;
	er->have_frame = 1;
}

/* -------------------------------------------------------------------------- */
/* harmonic amplitude resampling between pitches (FUN_266161b0)                */
static void vr12_resample_harm(float pitch_src, float pitch_dst, int n, const float *src, float *dst, int total)
{
	if (pitch_src == pitch_dst)
	{
		memcpy(dst, src, n * sizeof(float));
	}
	else
	{
		unsigned step = (unsigned)ftol((double)pitch_src / (double)pitch_dst * 16777216.0);
		unsigned pos = step;
		int k = 0, i;

		for (; pos <= 0x1000000u; pos += step)
		{
			dst[k] = (float)((double)(float)pos * 5.9604645e-08 * (double)src[0]);
			k++;
		}
		for (i = k; i < n; i++)
		{
			unsigned idx = pos >> 24;
			dst[i] = (float)(((double)src[idx] - (double)src[idx - 1]) * (double)(float)(pos & 0xffffff) * 5.9604645e-08 + (double)src[idx - 1]);
			pos += step;
		}
	}
	memset(dst + n, 0, (total - n) * sizeof(float));
}

/* LSF interpolation (FUN_266116e1) */
static void vr12_lsf_interp(const float *cur, const float *prev, float frac, float *out)
{
	int i;
	for (i = 0; i < VR12_LPC_ORDER; i++)
		out[i] = (float)(((double)cur[i] - (double)prev[i]) * (double)frac + (double)prev[i]);
	for (i = 1; i < VR12_LPC_ORDER; i++)
	{
		if ((double)out[i] < (double)out[i - 1] + 45.0)
			out[i] = (float)((double)out[i - 1] + 45.0);
	}
	if (out[9] > 3999.0f)
		out[9] = 3999.0f;
}

/* parameter interpolation for the current subframe set (FUN_266111c0) */
static void vr12_interp_params(vr12_decoder_t *d)
{
	vr12_params_t *cur = &d->p;
	vr12_synparams_t *sp = &d->sp;
	vr12_prevparams_t *pv = &d->prev;
	float frac;
	int nh, i;
	float a_prev[VR12_NHARM_MAX], a_cur[VR12_NHARM_MAX];

	if (sp->sub_left == 0)
	{
		if (d->timescale >= 1.0f)
			sp->sub_count = (int16_t)ftol(ceil((double)d->timescale));
		else
			sp->sub_count = 1;
		sp->sub_left = sp->sub_count;
		sp->frame_len = (int16_t)ftol((double)(float)(180.0f * d->timescale / (float)sp->sub_count));
		sp->nsub = (int16_t)ftol(floor((double)(float)((float)sp->frame_len / 60.0f)));
		sp->frame_len = (int16_t)ftol(floor((double)sp->frame_len / (double)sp->nsub) * (double)sp->nsub);
	}

	if ((pv->voicing == 0.0f && cur->voicing > 0.0f) || (pv->voicing > 0.0f && cur->voicing == 0.0f))
		frac = (sp->sub_count - sp->sub_left < sp->sub_count >> 1) ? 0.0f : 1.0f;
	else
		frac = (float)((double)(sp->sub_count - sp->sub_left + 1) / (double)sp->sub_count);

	sp->pitch = (float)(((double)cur->pitch - (double)pv->pitch) * (double)frac + (double)pv->pitch);
	nh = vr12_nharm(sp->pitch);
	if (nh > VR12_NHARM_MAX) nh = VR12_NHARM_MAX;
	vr12_resample_harm(pv->pitch, sp->pitch, nh, pv->amps, a_prev, VR12_NHARM_MAX);
	vr12_resample_harm(cur->pitch, sp->pitch, nh, cur->amps, a_cur, VR12_NHARM_MAX);
	for (i = 0; i < nh; i++)
		sp->amps[i] = (float)(((double)a_cur[i] - (double)a_prev[i]) * (double)frac + (double)a_prev[i]);
	for (; i < VR12_NHARM_MAX; i++)
		sp->amps[i] = 0.0f;
	vr12_lsf_interp(cur->lsf, pv->lsf, frac, sp->lsf);
	sp->voicing = frac >= 0.5f ? cur->voicing : pv->voicing;

	sp->sub_left--;
	d->need_input = sp->sub_left == 0;
	if (sp->sub_left == 0)
	{
		memcpy(pv->amps, cur->amps, sizeof(pv->amps));
		memcpy(pv->lsf, cur->lsf, sizeof(pv->lsf));
		pv->voicing = cur->voicing;
		pv->pitch = cur->pitch;
		pv->gain = cur->gain;
	}
}

/* long-silence LSF smoothing (FUN_2660a23e) */
static void vr12_smooth_lsf(float *lsf, float *smooth, int *count, float voicing)
{
	int i;
	if (voicing <= 0.0f)
		(*count)--;
	else
		*count = 10;
	if (*count == 9)
		memcpy(smooth, lsf, VR12_LPC_ORDER * sizeof(float));
	if (*count < 10)
	{
		for (i = 0; i < VR12_LPC_ORDER; i++)
			smooth[i] = (float)((double)lsf[i] * (double)0.2f + (double)smooth[i] * (double)0.8f);
	}
	if (*count < 0)
	{
		*count = 0;
		memcpy(lsf, smooth, VR12_LPC_ORDER * sizeof(float));
	}
}

/* LSF (Hz) -> LPC polynomial a[0..10], a[0] = 1 (FUN_26612a90) */
static void vr12_lsf_to_lpc(const float *lsf, float *a)
{
	float p[6], q[6];
	float w = 0.000125f * 6.2831855f;
	int i, j;

	p[0] = 1.0f;
	q[0] = 1.0f;
	/* the cosine argument goes to the CRT as the unrounded x87 product */
	p[1] = (float)(cos((double)w * lsf[0]) * -2.0);
	q[1] = (float)(cos((double)w * lsf[1]) * -2.0);
	for (i = 1; i < 5; i++)
	{
		float c1 = (float)(cos((double)w * lsf[2 * i]) * -2.0);
		float c2 = (float)(cos((double)w * lsf[2 * i + 1]) * -2.0);
		p[i + 1] = (float)((double)p[i - 1] * 2.0 + (double)c1 * (double)p[i]);
		q[i + 1] = (float)((double)q[i - 1] * 2.0 + (double)c2 * (double)q[i]);
		for (j = i; j > 1; j--)
		{
			p[j] = (float)((double)c1 * (double)p[j - 1] + (double)p[j] + (double)p[j - 2]);
			q[j] = (float)((double)c2 * (double)q[j - 1] + (double)q[j] + (double)q[j - 2]);
		}
		p[1] = (float)((double)p[1] + (double)c1);
		q[1] = (float)((double)q[1] + (double)c2);
	}
	for (i = 5; i != 0; i--)
	{
		p[i] = (float)((double)p[i] + (double)p[i - 1]);
		q[i] = (float)((double)q[i] - (double)q[i - 1]);
	}
	a[0] = 1.0f;
	for (i = 1; i <= 5; i++)
	{
		a[i] = (float)(((double)p[i] + (double)q[i]) * 0.5);
		a[11 - i] = (float)(((double)p[i] - (double)q[i]) * 0.5);
	}
}

/* x^a via x87 fyl2x / f2xm1 / fscale (FUN_26612a27) */
static float vr12_powf(float x, float a)
{
	return (float)pow((double)x, (double)a);
}

/* spectral shaping of the flat harmonic amplitudes by the LPC envelope, with
 * formant-valley attenuation (FUN_26612550) */
static void vr12_shape_harmonics(float pitch, const float *lpc, float voicing, int nh, float *amps)
{
	float spec[66];
	float pw[33];
	float valley[45];
	int16_t vidx[46];
	int nval = 1, i, k;
	float alpha = -0.175f;
	unsigned step, pos;
	int h;

	for (i = 0; i < VR12_LPC_ORDER; i++)
		if (lpc[i + 1] == 0.0f)
			break;
	if (i != VR12_LPC_ORDER || nh == 0)
		return;

	memcpy(spec, lpc, 11 * sizeof(float));
	memset(spec + 11, 0, 55 * sizeof(float));
	vr12_rfft(spec, 6);
	for (i = 0; i < 32; i++)
		pw[i] = (float)((double)spec[2 * i + 1] * spec[2 * i + 1] + (double)spec[2 * i] * spec[2 * i] + (double)1e-06f);
	/* pw[32] is never read by the original either: its loops stop at bin 31 */
	pw[32] = pw[31];

	for (i = 1; i < 31; i++)
	{
		if (pw[i] < pw[i - 1] && pw[i] < pw[i + 1])
		{
			valley[nval] = (float)sqrt(1.0 / (double)pw[i]);
			vidx[nval] = (int16_t)i;
			nval++;
			i++;
		}
	}
	valley[0] = (float)sqrt(1.0 / (double)pw[0]);
	vidx[0] = 0;
	valley[nval] = (float)sqrt(1.0 / (double)pw[31]);
	vidx[nval] = 31;
	nval++;

	if (voicing > 0.25)
	{
		if (pitch > 53.33f)
		{
			if (pitch > 80.0f)
				alpha = -0.25f;
			else
				alpha = -0.175f;
		}
		else
			alpha = -0.1f;
	}
	else
		alpha = -0.175f;

	step = (unsigned)ftol(64.0 / (double)pitch * 16777216.0);
	pos = step;
	h = 0;
	for (k = 0; k < nval - 1; k++)
	{
		float slope = (float)(((double)valley[k + 1] - (double)valley[k]) / (double)(vidx[k + 1] - vidx[k]));
		int bin = (int)pos >> 24;
		while (h < nh && bin < vidx[k + 1])
		{
			float v = (float)(((double)(float)(int)pos * 5.9604645e-08 - (double)vidx[k]) * (double)slope + (double)valley[k]);
			float e = (float)((double)(float)(pos & 0xffffff) * 5.9604645e-08 * ((double)pw[bin + 1] - (double)pw[bin]) + (double)pw[bin]);
			float r = (float)((double)v * (double)v * (double)e);
			if (r > 1.0f)
			{
				float g = vr12_powf(r, alpha);
				if (g < 0.3f) g = 0.3f;
				amps[h] = (float)((double)g * (double)amps[h]);
			}
			pos += step;
			h++;
			bin = (int)pos >> 24;
		}
	}
}

/* -------------------------------------------------------------------------- */
/* sinusoidal synthesis                                                        */

/* dot product with x87-style double accumulation (FUN_266147d0) */
static double vr12_dotd(const float *a, const float *b, int n)
{
	double acc = 0.0, part = 0.0;
	for (; n > 5; n -= 6)
	{
		acc = (double)a[0] * b[0] + (double)a[2] * b[2] + part + acc;
		part = (double)a[4] * b[4] + (double)a[1] * b[1] + (double)a[3] * b[3] + (double)a[5] * b[5];
		a += 6; b += 6;
	}
	for (; n != 0; n--)
	{
		acc = part + acc;
		part = (double)a[0] * b[0];
		a++; b++;
	}
	return part + acc;
}

static float vr12_dot(const float *a, const float *b, int n)
{
	return (float)vr12_dotd(a, b, n);
}

/* scale x[0..n) so its energy becomes `target` (FUN_26616520) */
static void vr12_normalize(float *x, int n, float target)
{
	float e = vr12_dot(x, x, n);
	if (e > 0.0f)
	{
		float s = (float)sqrt((double)target / (double)e);
		int i;
		for (i = 0; i < n; i++)
			x[i] = (float)((double)s * (double)x[i]);
	}
}

/* one pitch period of the harmonic set into the 256-sample buffer (FUN_26617180) */
static void vr12_build_period(const float *amps, const int *phase, int nh, float *buf)
{
	int i, k = 2;
	memset(buf, 0, VR12_SYN_N * sizeof(float) + 8);
	for (i = 0; i < nh; i++)
	{
		float a = (float)((double)amps[i] * (double)vr12_harm_window[i]);
		buf[k] = (float)((double)a * (double)vr12_sine_table[phase[i]]);           /* real:  a * sin(theta) */
		buf[k + 1] = (float)(-(double)a * (double)vr12_sine_table[64 + phase[i]]); /* imag: -a * cos(theta) */
		k += 2;
	}
	vr12_irfft(buf, VR12_SYN_ORDER);
}

/* cubic time-warp resampling of the period buffer (FUN_26617240). Returns the
 * final read phase in periods. */
static float vr12_warp(float *out, int n, float *buf, float step, float phase0)
{
	const int N = VR12_SYN_N;
	const unsigned mask = (1u << (VR12_SYN_ORDER + 16)) - 1;
	int istep, i;
	unsigned pos;

	buf[N] = buf[0];
	buf[N + 1] = buf[1];
	buf[N + 2] = buf[2];
	buf[-1] = buf[N - 1];
	istep = ftol((double)(float)(65536.0f * step));
	pos = (unsigned)ftol((double)(float)(65536.0f * (float)(float)((float)N * phase0))) & mask;
	for (i = 0; i < n; i++)
	{
		const float *t = vr12_interp_table + ((pos & 0xffff) >> 10) * 4;
		int idx = (int)pos >> 16;
		const float *s = buf + idx - 1;
		float v;
		v = (float)((double)s[0] * t[0]);
		v = (float)((double)s[1] * t[1] + v);
		v = (float)((double)s[2] * t[2] + v);
		v = (float)((double)s[3] * t[3] + v);
		out[i] = v;
		pos = (pos + istep) & mask;
	}
	return (float)(int)(pos >> VR12_SYN_ORDER) * 1.52587890625e-05f;
}

/* cross-fade old/new subframe signals into out (FUN_26617030) */
static void vr12_crossfade(const float *old, const float *neu, int overlap, int len, float *out)
{
	int half = (len - overlap) >> 1, i;
	float step, wo, wn;

	if ((len - overlap) & 1)
	{
		*out += *old; old++; out++;
	}
	for (i = half; i > 0; i--)
	{
		*out += *old; old++; out++;
	}
	step = overlap < 1 ? 0.0f : 1.0f / (float)overlap;
	wn = 0.0f; wo = 1.0f;
	for (i = overlap; i > 0; i--)
	{
		*out = (float)((double)wn * *neu + (double)wo * *old + *out);
		neu++; old++; out++;
		wn = (float)((double)wn + step); wo = (float)((double)wo - step);
	}
	for (i = half; i > 0; i--)
	{
		*out += *neu; neu++; out++;
	}
}

/* one subframe of sinusoidal synthesis (FUN_266162e0) */
static void vr12_synth_subframe(vr12_synth_t *st, const float *amps, const int *phase, float syn_pitch,
	float pitch, float prev_pitch, int nh, float *out, int len, int overlap)
{
	float a_old[VR12_SUBFRAME + 4], a_new[VR12_SUBFRAME + 4];
	int mid;

	if (((overlap + len) & 1) == 1)
		overlap--;
	if (overlap > len)
		overlap = len;
	mid = overlap + ((len - overlap) >> 1);

	float *buf = st->bufmem + 1;

	st->phase = vr12_warp(a_old, mid, buf, st->step, st->phase);
	vr12_build_period(amps, phase, nh, buf);
	st->step = (float)((double)VR12_SYN_N / (double)syn_pitch);
	st->phase = (float)((double)(mid - overlap) / (double)prev_pitch + (double)st->phase_acc);
	st->phase = (float)(((double)pitch / (double)syn_pitch) * (double)st->phase);
	st->phase = vr12_warp(a_new, mid, buf, st->step, st->phase);
	st->phase_acc = (float)((double)len / (((double)pitch + (double)prev_pitch) * 0.5) + (double)st->phase_acc);
	st->phase_acc = (float)((double)st->phase_acc - (double)ftol((double)st->phase_acc));
	vr12_crossfade(a_old, a_new, overlap, len, out);
}

/* the frame synthesizer (FUN_26611eb0): 3 subframes */
static void vr12_synthesize(vr12_synth_t *st, const float *amps_cur, const float *amps_prev, float pitch_cur,
	float pitch_prev, float voicing_cur, float voicing_prev, int frame_len, int nsub, float *out)
{
	int sublen = frame_len / nsub;
	int overlap = ftol((double)(float)((float)sublen * 1.0f));
	float p_prev = pitch_prev;
	int s;

	if (overlap & 1)
		overlap--;

	for (s = 0; s < nsub; s++)
	{
		float frac, vc, p, syn_pitch;
		int mult, nv, nvm, nh, i, k;
		float a_prev[VR12_NHARM_MAX], a_cur[VR12_NHARM_MAX];
		int phase[VR12_NHARM_MAX + 1];
		float unv_energy;

		if (voicing_cur <= 0.0f || voicing_prev <= 0.0f)
			frac = s < nsub >> 1 ? 0.0f : 1.0f;
		else
			frac = (float)((double)(s + 1) / (double)nsub);
		vc = s < nsub >> 1 ? voicing_prev : voicing_cur;

		if (fabs(((double)pitch_cur - (double)pitch_prev) / (double)pitch_cur) >= 0.15000000596046448)
			p = s < nsub >> 1 ? pitch_prev : pitch_cur;
		else
			p = (float)(((double)pitch_cur - (double)pitch_prev) * (double)frac + (double)pitch_prev);
		if (p > 180.0f) p = 180.0f;
		if (p < 8.0f) p = 8.0f;

		mult = ftol(125.0 / (double)p);
		if (mult == 0)
			mult = 1;
		syn_pitch = (float)((double)mult * (double)p);
		nv = vr12_nvoiced(p, vc);
		nvm = mult * nv;
		nh = vr12_nharm(syn_pitch);
		if (nh > VR12_NHARM_MAX) nh = VR12_NHARM_MAX;
		if (nvm > VR12_NHARM_MAX) nvm = VR12_NHARM_MAX;

		for (i = 0; i < nvm; i++)
			phase[i + 1] = 0;
		if (nv > 0)
			phase[((nv >> 1) + 1) * mult] = 7;

		vr12_resample_harm(pitch_prev, syn_pitch, nh, amps_prev, a_prev, VR12_NHARM_MAX);
		vr12_resample_harm(pitch_cur, syn_pitch, nh, amps_cur, a_cur, VR12_NHARM_MAX);
		for (i = 0; i < nh; i++)
			a_cur[i] = (float)(((double)a_cur[i] - (double)a_prev[i]) * (double)frac + (double)a_prev[i]);
		for (i = 0; i < mult - 1; i++)
			for (k = i; k < nvm; k += mult)
				a_cur[k] = 0.0f;
		unv_energy = 0.0f;
		for (i = nvm - 1 + mult; i < nh; i += mult)
			unv_energy = (float)((double)a_cur[i] * a_cur[i] + unv_energy);
		vr12_normalize(a_cur + nvm, nh - nvm, unv_energy * 0.5f);   /* the unvoiced tail is scaled to HALF its energy */
		for (i = nvm; i < nh; i++)
			phase[i + 1] = (int)(vr12_rand(&st->seed) & 0xff);

		vr12_synth_subframe(st, a_cur, phase + 1, syn_pitch, p, p_prev, nh, out + s * sublen, sublen, overlap);
		p_prev = p;
	}
}

/* LPC synthesis filter over the frame with LSF interpolation (FUN_26611a20).
 * x holds 10 history samples followed by frame_len samples; filtered in place. */
static void vr12_lpc_filter(vr12_lpcfilt_t *f, const float *lsf, float *x, int frame_len)
{
	const float *prev_lsf = f->lsf;
	float a[11], lsf_i[VR12_LPC_ORDER];
	int seglen, seg, i, j, start = 0;
	float w = 0.0f;

	memcpy(x, f->mem, VR12_LPC_ORDER * sizeof(float));
	seglen = ftol((double)frame_len * 0.25);
	vr12_lsf_to_lpc(prev_lsf, a);
	seglen = (int16_t)seglen >> 1;
	for (seg = 0; seg < 5; seg++)
	{
		int n;
		for (j = 0; j < 5; j++)
		{
			float t = a[j + 1];
			a[j + 1] = -a[10 - j];
			a[10 - j] = -t;
		}
		if (seg == 4)
			seglen = frame_len - start;
		for (n = start; n < start + seglen; n++)
		{
			float *px = x + n;
			px[10] = (float)((double)vr12_dot(px, a + 1, 10) + (double)px[10]);
		}
		start += seglen;
		w = (float)((double)w + 0.25);
		if (seg == 3)
			vr12_lsf_to_lpc(lsf, a);
		else
		{
			for (i = 0; i < VR12_LPC_ORDER; i++)
				lsf_i[i] = (float)(((double)lsf[i] - (double)prev_lsf[i]) * (double)w + (double)prev_lsf[i]);
			for (i = 1; i < VR12_LPC_ORDER; i++)
			{
				if ((double)lsf_i[i] + 45.0 < (double)lsf_i[i - 1])
					lsf_i[i] = (float)((double)lsf_i[i - 1] + 45.0);
			}
			vr12_lsf_to_lpc(lsf_i, a);
		}
		seglen = ftol((double)frame_len * 0.25);
	}
	memcpy(f->lsf, lsf, VR12_LPC_ORDER * sizeof(float));
	memcpy(f->mem, x + frame_len, VR12_LPC_ORDER * sizeof(float));
	for (i = 0; i < frame_len; i++)
	{
		if (x[i + 10] > 32000.0f)
			x[i + 10] = 32000.0f;
		else if (x[i + 10] < -32000.0f)
			x[i + 10] = -32000.0f;
	}
}

/* -------------------------------------------------------------------------- */
/* public API                                                                  */

vr12_decoder_t *vr12_create(void)
{
	vr12_decoder_t *d = (vr12_decoder_t *)calloc(1, sizeof(*d));
	int i;
	if (!d)
		return NULL;
	vr12_reset(d);
	(void)i;
	return d;
}

void vr12_destroy(vr12_decoder_t *d)
{
	free(d);
}

void vr12_reset(vr12_decoder_t *d)
{
	int i;
	memset(d, 0, sizeof(*d));
	/* quantiser (FUN_266091bc) */
	for (i = 0; i < VR12_LPC_ORDER; i++)
	{
		static const uint32_t defaults[10] = { 0x43ab8000, 0x443c0000, 0x44930000, 0x44c00000, 0x44e62000,
			0x4508d000, 0x4519f000, 0x45326000, 0x45463000, 0x455e3000 };
		float v; memcpy(&v, &defaults[i], 4);
		d->q.lsf_prev[i] = v;
		d->q.lsf_cur[i] = v;
	}
	d->q.prev_frame_type = 999;
	d->q.seed = 0x37;
	d->q.gain_floor = 1e6f;
	/* erasure (FUN_2660a59f) */
	d->er.have_frame = 1;
	d->er.had_frame = 1;
	d->er.gain = 500.0f;
	for (i = 0; i < VR12_LPC_ORDER; i++)
		d->er.lsf[i] = (float)i * 400.0f + 300.0f;
	/* synthesis params (FUN_2660fb87) */
	d->sp.prev_pitch = 50.0f;
	d->sp.frame_len = VR12_FRAME;
	d->sp.nsub = VR12_SUBFRAMES;
	d->sp.sub_left = 0;
	d->sp.sub_count = 1;
	d->sp.smooth_count = 10;
	/* previous params (FUN_2660fa30) */
	d->prev.pitch = 100.0f;
	for (i = 0; i < VR12_LPC_ORDER; i++)
		d->prev.lsf[i] = (float)i * 400.0f + 300.0f;
	/* lpc filter (FUN_26611d4c) */
	for (i = 0; i < VR12_LPC_ORDER; i++)
		d->lpc.lsf[i] = (float)i * 400.0f + 300.0f;
	/* synth (FUN_26612455) */
	d->syn.seed = 1;
	d->timescale = 1.0f;
	d->need_input = 1;
}

int vr12_decode_frame(vr12_decoder_t *d, const uint8_t *frame6, int16_t *out180)
{
	float x[VR12_LPC_ORDER + VR12_FRAME];
	float lpc[11];
	int nh, i;

	if (d->need_input && d->er.have_frame)
	{
		vr12_bits_t b = { frame6, 6, 0, 0 };
		if (vr12_count_frames(frame6, 6) == 0)
			return -1;
		vr12_unpack(&d->q, &b);
	}

	/* FUN_266083af with warp 1.0: proceed */
	vr12_dequant(&d->q, &d->p);
	vr12_erasure(&d->er, &d->p);
	if (!d->er.have_frame && d->er.had_frame == 0)
		d->er.have_frame = 0;

	/* FUN_26609d30 */
	vr12_interp_params(d);
	nh = vr12_nharm(d->sp.pitch);
	if (nh > VR12_NHARM_MAX) nh = VR12_NHARM_MAX;
	vr12_smooth_lsf(d->sp.lsf, d->sp.smooth_lsf, &d->sp.smooth_count, d->sp.voicing);
	vr12_lsf_to_lpc(d->sp.lsf, lpc);
	vr12_shape_harmonics(d->sp.pitch, lpc, d->sp.voicing, nh, d->sp.amps);
	memset(x + VR12_LPC_ORDER, 0, d->sp.frame_len * sizeof(float));
	vr12_synthesize(&d->syn, d->sp.amps, d->sp.prev_amps, d->sp.pitch, d->sp.prev_pitch, d->sp.voicing,
		d->sp.prev_voicing, d->sp.frame_len, d->sp.nsub, x + VR12_LPC_ORDER);
	vr12_lpc_filter(&d->lpc, d->sp.lsf, x, d->sp.frame_len);
	for (i = 0; i < VR12_FRAME; i++)
		out180[i] = (int16_t)lrintf(x[VR12_LPC_ORDER + i]);
	/* FUN_2661167d */
	memcpy(d->sp.prev_amps, d->sp.amps, sizeof(d->sp.prev_amps));
	memcpy(d->sp.prev_lsf, d->sp.lsf, sizeof(d->sp.prev_lsf));
	d->sp.prev_voicing = d->sp.voicing;
	d->sp.prev_pitch = d->sp.pitch;
	d->sp.prev_gain = d->sp.gain;
	return VR12_FRAME;
}

int vr12_decode_hl_frame(vr12_decoder_t *d, const uint8_t *frame12, int16_t *out360)
{
	if (vr12_decode_frame(d, frame12, out360) < 0)
		return -1;
	if (vr12_decode_frame(d, frame12 + 6, out360 + VR12_FRAME) < 0)
		return -1;
	return 2 * VR12_FRAME;
}

/* ========================================================================== */
/* ENCODER                                                                    */
/* ========================================================================== */
/*
 * The encoder half of Mssv12.asi (FUN_26607bbc), reconstructed the same way as
 * the decoder above. Per 180-sample frame:
 *
 *   FUN_26609580  analysis:  DC-removal filter -> 401-sample ring -> pitch
 *                 estimate (FUN_2660de60, on a perceptually weighted, low-passed,
 *                 2:1 decimated signal with a three-block normalised cross-
 *                 correlation search and a frame-to-frame tracker) -> Kaiser
 *                 window of 221/241/261 samples by pitch, centred one frame
 *                 back in the ring -> LPC (autocorrelation, Levinson, bandwidth
 *                 0.994) -> 512-point spectrum -> pitch refinement by harmonic
 *                 template matching (FUN_2660efc0) -> per-harmonic voicing
 *                 (FUN_2660e8d0) and hysteresis (FUN_2660e7cd).
 *   FUN_26608b90  quantise:  frame type from voicing, LPC -> LSF (FUN_2660ca40,
 *                 Chebyshev + Newton deflation + one closed-form quartic per
 *                 polynomial), 16-survivor multi-stage VQ (FUN_2660b970) against
 *                 the decoder's codebooks, log gain, log pitch, linear voicing.
 *   FUN_26608820  pack the bits, LSB first.
 *
 * Every float store the original makes is made here too, and the x87 double
 * intermediates are kept where they influence a stored value or a comparison.
 */

#define VR12_ENC_RING     401
#define VR12_PITCH_MIN    5      /* candidate lags, at 4 kHz */
#define VR12_PITCH_NLAG   86     /* 5..90 */
#define VR12_PITCH_HIST   135
#define VR12_VQ_M         16     /* survivors */
#define VR12_VQ_CB        16     /* entries per stage */
#define VR12_VQ_STAGES    6

/* the pitch-decision state machine (FUN_2661341c) */
typedef struct {
	float   level;      /* +0x00: 10*log10(frame energy), 50 */
	int16_t count;      /* +0x04: frames seen, saturates at 5 */
	float   maxlev;     /* +0x08: 70 */
	float   minlev;     /* +0x0c: 50 */
	int16_t hang;       /* +0x10: hangover frames */
	int16_t silence;    /* +0x12: consecutive non-speech frames, saturates at 5 */
	int16_t prev;       /* +0x14: previous decision, 1 */
	float   range;      /* +0x18: smoothed level range, 20 */
} vr12_vad_t;

/* pitch estimator state (FUN_2660e0d1, 0x54 bytes of pointers) */
typedef struct {
	float   hp_state[4];                     /* [0]  order-4 high-pass memory */
	float   lp_state[3];                     /* [1]  order-3 low-pass memory */
	float   hist[VR12_PITCH_HIST];           /* [2]  decimated history */
	float   prev_scores[VR12_PITCH_NLAG];    /* [3]  last frame's lag scores, -1 */
	float   prev_lsf[10];                    /* [4]  363.6 * (i+1) */
	float   wf_state[10];                    /* [5]  weighting filter memory */
	int     cur_idx, prev_idx;               /* [6][7] chosen lags, 40 */
	float   cur_score, prev_score;           /* [8][9] -1 */
	float   win[180];                        /* [12] asymmetric Hamming */
	int     start_n[VR12_PITCH_NLAG], len_n[VR12_PITCH_NLAG];  /* [16][17] +-15.5 % */
	int     start_w[VR12_PITCH_NLAG], len_w[VR12_PITCH_NLAG];  /* [14][15] +-25 % */
	vr12_vad_t vad;                          /* [20] */
} vr12_pitch_t;

/* voicing analyser state (FUN_2660eec5) */
typedef struct {
	int16_t flags[VR12_NHARM_MAX];  /* [0] per-harmonic voiced flags */
	float   level;                  /* [1] tracked spectrum level, 1e6 */
	float   prev_voicing;           /* [3] */
} vr12_vstate_t;

/* the encoder-side parameter set (FUN_2660f7f0 layout, pointers flattened) */
typedef struct {
	float   voicing, pitch, gain;
	float   lsf[VR12_LPC_ORDER];
	float   lpc[VR12_LPC_ORDER + 1];
	float   lpcneg[VR12_LPC_ORDER];
	int16_t speech;                 /* +0x1c: pitch tracker's speech flag */
} vr12_eparams_t;

/* multi-stage VQ workspace (FUN_2660c720) */
typedef struct {
	float   dist[VR12_VQ_M];
	float   rows_a[VR12_VQ_M * VR12_LPC_ORDER];
	float   rows_b[VR12_VQ_M * VR12_LPC_ORDER];
	int16_t idx_a[VR12_VQ_M * VR12_VQ_STAGES];
	int16_t idx_b[VR12_VQ_M * VR12_VQ_STAGES];
	int16_t pair[VR12_VQ_M][2];
} vr12_vq_t;

struct vr12_encoder_s {
	/* analysis (FUN_2660990c) */
	float   ring[VR12_ENC_RING];
	int     ring_pos;
	float   pre_in, pre_out;        /* FUN_2660f76e, coefficient 0.99 */
	vr12_vstate_t  vs;
	vr12_pitch_t   ps;
	vr12_eparams_t p;
	int16_t wlen;
	float   prev_pitch, prev_voicing;   /* +0x34, +0x38 */
	/* quantiser (FUN_266091bc) */
	int16_t frame_type;
	int16_t voicing_idx, pitch_idx, gain_idx;
	int16_t lsf_idx[VR12_VQ_STAGES];
	vr12_vq_t vq;
};

/* the two fixed IIR filters of the pitch front end (DAT_2661d8bc / DAT_2661d8a0):
 * b[0..N] then a[1..N] */
static const float vr12_pitch_hp[9] = {
	0.896698415f, -3.58456206f, 5.37572765f, -3.58456206f, 0.896698415f,
	-3.7907722f, 5.39682484f, -3.41970277f, 0.813724339f
};
static const float vr12_pitch_lp[7] = {
	0.13209632f, 0.16441597f, 0.16441597f, 0.13209632f,
	-1.00457573f, 0.753910065f, -0.156309694f
};
static const float vr12_pitch_off1[5] = { -1.5f, -0.75f, 0.0f, 0.75f, 1.5f };
static const float vr12_pitch_off2[4] = { -0.5f, -0.25f, 0.25f, 0.5f };

/* -------------------------------------------------------------------------- */
/* generic IIR in transposed direct form II (FUN_26614840). c = b[0..n], a[1..n] */
/* at c[n+1..2n]; s = n delay slots. The original unrolls by two and the float  */
/* rounding of that unrolling is reproduced.                                    */
static void vr12_iir(const float *x, float *y, int len, const float *c, int n, float *s)
{
	int i, k;

	if (n < 2)
	{
		if (n == 0)
		{
			for (i = 0; i < len; i++)
				y[i] = c[0] * x[i];
			return;
		}
		for (i = 0; i < len; i++)
		{
			y[i] = (float)((double)c[0] * x[i] + s[0]);
			s[0] = (float)((double)c[1] * x[i] - (double)c[2] * y[i]);
		}
		return;
	}
	{
		float b0 = c[0], b1 = c[1], bn1 = c[n - 1], an1 = c[2 * n - 1], bn = c[n], an = c[2 * n];
		if (len < 2)
		{
			y[0] = (float)((double)b0 * x[0] + s[0]);
			for (k = 1; k < n; k++)
				s[k - 1] = (float)(((double)c[k] * x[0] - (double)c[n + k] * y[0]) + s[k]);
			s[n - 1] = (float)((double)bn * x[0] - (double)an * y[0]);
			return;
		}
		for (i = 0; i + 1 < len; i += 2)
		{
			double x0 = x[i], x1 = x[i + 1];
			float y0 = (float)((double)b0 * x0 + s[0]);
			float y1 = (float)((((double)b1 * x0 + (double)b0 * x1) - (double)y0 * c[n + 1]) + s[1]);
			y[i] = y0;
			y[i + 1] = y1;
			for (k = 2; k < n; k++)
				s[k - 2] = (float)(((x0 * c[k] + (x1 * c[k - 1] - (double)y1 * c[n + k - 1])) - (double)y0 * c[n + k]) + s[k]);
			s[n - 2] = (float)(((double)bn * x0 + ((double)bn1 * x1 - (double)an1 * y1)) - (double)an * y0);
			s[n - 1] = (float)((double)bn * x1 - (double)an * y1);
		}
		if (i < len)
		{
			double xl = x[len - 1];
			float yl = (float)((double)b0 * xl + s[0]);
			y[len - 1] = yl;
			for (k = 1; k < n; k++)
				s[k - 1] = (float)(((double)c[k] * xl - (double)c[n + k] * yl) + s[k]);
			s[n - 1] = (float)((double)bn * xl - (double)an * yl);
		}
	}
}

/* max finder (FUN_26616d30). The original compares the float bit patterns as
 * signed integers and tracks both extremes while the running "max" is negative,
 * which is a trick, not a bug: for negative floats the integer order is reversed,
 * so the integer minimum it hands back in that case IS the largest float. The
 * net effect is a plain first-occurrence argmax. */
static void vr12_argmax(const float *v, int n, int *idx, float *val)
{
	float mx = v[0];
	int imx = 0, i;

	for (i = 1; i < n; i++)
	{
		if (mx < v[i])
		{
			mx = v[i];
			imx = i;
		}
	}
	*idx = imx;
	*val = mx;
}

/* parabolic peak refinement (FUN_26616980): returns the fractional offset and
 * writes the interpolated peak value */
static float vr12_parabola(float ym, float y0, float yp, float *peak)
{
	float a = (float)(((double)ym + yp) * 0.5 - y0);
	float b = (float)(((double)yp - ym) * 0.5);
	float x;

	if (a == 0.0f)
		x = 0.0f;
	else
		x = (float)(-(double)b / ((double)a * 2.0));
	*peak = (float)(((double)a * x + b) * x + y0);
	return x;
}

/* autocorrelation of n lags (FUN_26615940) */
static void vr12_autocorr(int nlag, const float *x, int len, float *r)
{
	int i;
	for (i = 0; i < nlag; i++)
		r[i] = vr12_dot(x, x + i, len - i);
}

/* Levinson-Durbin (FUN_266157a0): a[0..n] with a[0] = 1, reflection coefficients
 * in k[], the prediction error in *err. Reflection coefficients are clamped to
 * +-0.9999. */
static void vr12_levinson(const float *r, int n, float *a, float *k, float *err)
{
	float tmp[20], *cur, *nxt, *swap;
	float e = r[0];
	int i, j;

	if (e == 0.0f)
		e = 1e-37f;
	if ((n & 1) == 0) { cur = a; nxt = tmp; }
	else { cur = tmp; nxt = a; }
	nxt[0] = 1.0f;
	cur[0] = 1.0f;
	for (i = 0; i < n; i++)
	{
		float acc = 0.0f, rc;
		for (j = 0; j <= i; j++)
			acc = (float)((double)cur[j] * r[i + 1 - j] + acc);
		rc = (float)((double)acc / e);
		if (rc > 0.9999f) rc = 0.9999f;
		if (rc < -0.9999f) rc = -0.9999f;
		k[i] = rc;
		nxt[i + 1] = -rc;
		for (j = 1; j <= i; j++)
			nxt[j] = (float)((double)cur[j] - (double)rc * cur[i + 1 - j]);
		e = (float)((1.0 - (double)rc * rc) * e);
		swap = cur; cur = nxt; nxt = swap;
	}
	*err = e;
}

/* bandwidth expansion a[i] *= g^i (FUN_26615700) */
static void vr12_bwexpand(const float *a, float *out, int n, float g)
{
	float f = 1.0f;
	int i;
	for (i = 0; i <= n; i++)
	{
		out[i] = f * a[i];
		f = f * g;
	}
}

/* scale a vector (FUN_26615760) */
static void vr12_scale(const float *x, int n, float s, float *out)
{
	int i;
	for (i = 0; i < n; i++)
		out[i] = x[i] * s;
}

/* -------------------------------------------------------------------------- */
/* LPC -> LSF (FUN_2660ca40). Order-10 path: symmetric/antisymmetric polynomials */
/* mapped to x = cos(w) (FUN_2660cec3 + FUN_2660cf64), one root of each found by */
/* Newton iteration with deflation (FUN_2660d08d), the remaining quartics solved  */
/* in closed form (FUN_2660d25e). Returns nonzero when the roots were not usable  */
/* and the uniform fallback (FUN_2660d212) was written instead.                  */

/* Newton root of the degree-`deg` polynomial p[0..deg] (p[deg] leading) from *x;
 * q[0..deg-1] receives the deflated polynomial. 0 = converged, 1 = 15 iterations
 * without convergence, -1 = failed. */
static int vr12_newton(float *x, int deg, const float *p, float *q)
{
	int status = 1, iter = 0, m;
	float b = 0.0f, d = 0.0f;

	while (iter < 15 && status == 1)
	{
		const float *pp;
		float *qq;
		q[deg - 1] = p[deg];
		b = q[deg - 1];
		d = (float)((double)b * *x + p[deg - 1]);
		pp = p + deg - 2;
		qq = q + deg - 1;
		for (m = deg - 2; m >= 0; m--)
		{
			qq--;
			*qq = d;
			b = (float)((double)b * *x + d);
			d = (float)((double)d * *x + *pp);
			pp--;
		}
		if (b == 0.0f)
			status = -1;
		else
		{
			*x = (float)((double)*x - (double)d / b);
			if ((double)d / b <= (double)1e-06f)
				status = 0;
		}
		iter++;
	}
	if (d < 0.0f)
		d = -d;
	if (d >= 0.01f)
		status = -1;
	return status;
}

/* closed-form roots of p[0..4] (FUN_2660d25e): Ferrari with the resolvent cubic
 * solved trigonometrically. All intermediates are float, as in the original. */
static void vr12_quartic(const float *p, float *out)
{
	float inv = (float)(1.0 / p[4]);
	float a3 = (float)((double)inv * p[3]);
	float a2 = (float)((double)inv * p[2]);
	float a1 = (float)((double)inv * p[1]);
	float a0 = (float)((double)inv * p[0]);
	float nq = -a2;
	float t18 = (float)((double)a3 * a1 - 4.0 * a0);
	float t28 = (float)((4.0 * a2 * a0 - (double)a3 * a3 * a0) - (double)a1 * a1);
	float t20 = (float)((double)nq * 0.33333334f);
	float cp = (float)((double)t18 - (double)nq * t20);
	float cq = (float)((2.0 * t20 * t20 * t20 - (double)t18 * t20) + t28);
	/* the CRT results stay on the x87 stack: only what the original stores is rounded */
	double r = sqrt(-(double)cp * 0.33333334f);
	float rr = (float)(r + r);
	double cs = cos(acos((3.0 * cq) / ((double)cp * rr)) * 0.33333334f);
	float y1 = (float)(cs * rr - t20);
	float h = (float)(0.5 * a3);
	float R = (float)sqrt(((double)a3 * a3 * 0.25f - a2) + y1);
	float t4 = (float)(((double)h * y1 - a1) / R);
	double u = (double)R - h, v = (double)R + h;
	float uf = (float)u, vf = (float)v, dd;

	dd = (float)sqrt(u * uf - ((double)y1 - t4) * 2.0);
	out[0] = (float)(((double)uf + dd) * 0.5);
	out[1] = (float)(((double)uf - dd) * 0.5);
	dd = (float)sqrt(v * vf - ((double)y1 + t4) * 2.0);
	out[2] = (float)((-(double)vf + dd) * 0.5);
	out[3] = (float)((-(double)vf - dd) * 0.5);
}

static int vr12_lpc_to_lsf(const float *a, int n, float fs, float *lsf)
{
	float P[10], Q[10], P2[11], Q2[11], tmp[10] = { 0 };
	float cheb[10];
	float acc1, acc2, x;
	int half = n >> 1, closed = (n < 15 && n > 7);
	int bad = 0, i, j, m, deg, cnt = 0, lim;

	/* FUN_2660cec3 */
	acc1 = 1.0f;
	acc2 = 1.0f;
	for (i = half - 1, j = 1; i >= 0; i--, j++)
	{
		P[i] = (float)(((double)a[j] + a[n + 1 - j]) - acc1);
		acc1 = P[i];
		Q[i] = (float)(((double)a[j] - a[n + 1 - j]) + acc2);
		acc2 = Q[i];
	}
	P[half] = 1.0f;
	Q[half] = 1.0f;

	/* FUN_2660cf64: to Chebyshev coefficients; note the coefficient row is not
	 * reset between output indices -- that is how the original does it */
	cheb[1] = 1.0f;
	cheb[2] = -2.0f;
	cheb[3] = 2.0f;
	for (j = 3; j <= (n >> 2); j++)
		cheb[j + 1] = cheb[j - 1];
	for (i = 0; i <= half; i++)
	{
		P2[i] = P[i];
		Q2[i] = Q[i];
		m = 1;
		for (j = i + 2; j <= half; j += 2)
		{
			P2[i] = (float)((double)cheb[m + 1] * P[j] + P2[i]);
			Q2[i] = (float)((double)cheb[m + 1] * Q[j] + Q2[i]);
			cheb[m + 1] = cheb[m + 1] - cheb[m];
			m++;
		}
	}

	x = 2.0f;
	lim = closed ? 4 : 1;
	for (deg = half; deg > lim; deg--)
	{
		if (vr12_newton(&x, deg, P2, tmp) != 0)
			bad = 1;
		lsf[cnt++] = x;
		memcpy(P2, tmp, deg * sizeof(float) + 4);
		if (vr12_newton(&x, deg, Q2, tmp) != 0)
			bad = 1;
		lsf[cnt++] = x;
		memcpy(Q2, tmp, deg * sizeof(float) + 4);
	}
	if (!closed)
	{
		if (P2[1] == 0.0f || Q2[1] == 0.0f)
			bad = 1;
		else
		{
			lsf[cnt] = (float)(-(double)P2[0] / P2[1]);
			lsf[cnt + 1] = (float)(-(double)Q2[0] / Q2[1]);
			cnt += 2;
		}
	}
	else
	{
		float rp[4], rq[4];
		vr12_quartic(P2, rp);
		vr12_quartic(Q2, rq);
		for (i = 0; i < 4; i++)
		{
			lsf[cnt + 2 * i] = rp[i];
			lsf[cnt + 2 * i + 1] = rq[i];
		}
		cnt += 8;
	}
	if (lsf[0] >= 2.0f || lsf[n - 1] <= -2.0f)
		bad = 1;
	for (i = 1; i < n; i++)
	{
		if (lsf[i - 1] < lsf[i])
			bad = 1;
	}
	if (bad == 0)
	{
		float k = (float)((double)fs * 0.15915494f);
		for (i = 0; i < n; i++)
			lsf[i] = (float)(acos((double)lsf[i] * 0.5) * k);
	}
	else
	{
		/* FUN_2660d212: evenly spaced */
		float v = (float)((double)fs / (float)n * 0.5);
		for (i = 0; i < n; i++)
		{
			lsf[i] = v;
			v = (float)(v + (double)fs / (float)n);
		}
	}
	return bad;
}

/* apply a half-stored symmetric window (FUN_2660f370) */
static void vr12_window(const float *x, const float *w, float *out, int len)
{
	int half = len >> 1, k;
	for (k = 0; k < half; k++)
	{
		out[k] = x[k] * w[k];
		out[len - 1 - k] = x[len - 1 - k] * w[k];
	}
	if (len & 1)
		out[half] = x[half] * w[half];
}

/* -------------------------------------------------------------------------- */
/* pitch estimation                                                            */

/* the pitch tracker's perceptual weighting (FUN_266144e0): LPC of the windowed
 * frame, LSF interpolation over three subframes against the previous frame,
 * A(z/g1)/A(z/0.8) filtering in place */
static void vr12_pitch_weight(float *x, int len, vr12_pitch_t *ps)
{
	float xw[180], r[11], a[11], k[10], err;
	float lsf[10], lsf_i[10], num[11], den[11], coef[21];
	float g1 = 0.9921875f, frac = 0.33333334f;
	int i, j;

	for (i = 0; i < len; i++)
		xw[i] = x[i] * ps->win[i];
	vr12_autocorr(11, xw, len, r);
	vr12_levinson(r, 10, a, k, &err);
	vr12_bwexpand(a, a, 10, 0.9921875f);
	vr12_lpc_to_lsf(a, 10, 8000.0f, lsf);
	for (i = 1; i < 10; i++)
	{
		float d = lsf[i] - lsf[i - 1];
		if (d < 64.0f)
			g1 = 0.98828125f;
	}
	for (j = 0; j < 3; j++)
	{
		for (i = 0; i < 10; i++)
			lsf_i[i] = (float)(((double)lsf[i] - ps->prev_lsf[i]) * frac + ps->prev_lsf[i]);
		frac = frac + 0.33333334f;
		vr12_lsf_to_lpc(lsf_i, a);
		vr12_bwexpand(a, num, 10, g1);
		vr12_bwexpand(a, den, 10, 0.8f);
		memcpy(coef, num, 11 * sizeof(float));
		memcpy(coef + 11, den + 1, 10 * sizeof(float));
		vr12_iir(x + 60 * j, x + 60 * j, 60, coef, 10, ps->wf_state);
	}
	memcpy(ps->prev_lsf, lsf, sizeof(lsf));
}

/* one block's best lag in a window of the score array; `beg`/`end` track the
 * window already searched so overlapping windows only look at the new tail.
 * Shared shape of the loops in FUN_266140b0 and FUN_266138fb. */
static void vr12_window_max(const float *sc, int start, int len, int *best, float *bestv, int *prev_end)
{
	if (*best < start)
	{
		vr12_argmax(sc + start, len, best, bestv);
		*best += start;
	}
	else
	{
		int end = start + len;
		if (end != *prev_end)
		{
			float v = sc[*prev_end];
			int bi = *prev_end;
			if (end - *prev_end == 2 && v < sc[*prev_end + 1])
			{
				v = sc[*prev_end + 1];
				bi = *prev_end + 1;
			}
			if (*bestv < v)
			{
				*bestv = v;
				*best = bi;
			}
		}
	}
	*prev_end = start + len;
}

/* normalised cross-correlation scores per lag (FUN_26613d30 + FUN_266140b0):
 * x holds 90 history + 90 current decimated samples. */
static void vr12_pitch_scores(float *x, vr12_pitch_t *ps, float *scores)
{
	float xc[3][VR12_PITCH_NLAG];
	float e[151];
	float ramp = 0.58f, esum, bestv;
	const float *En;
	int sel, i, j, lag, best, prev_end, blk;
	float *cur;
	const float *eblk;

	for (i = 0; i < 90; i++)
	{
		x[i] = ramp * x[i];
		ramp = ramp + 0.004666667f;
	}
	/* FUN_26613ece: 30-sample block cross-correlations against lags 5..90 */
	for (j = 0; j < 3; j++)
	{
		const float *b = x + 90 + 30 * j;
		for (lag = VR12_PITCH_MIN; lag < 91; lag++)
			xc[j][lag - VR12_PITCH_MIN] = vr12_dot(b, b - lag, 30);
	}
	/* FUN_26613f39: energies of every 30-sample window ending at 179 - k */
	{
		double acc = vr12_dotd(x + 150, x + 150, 30);
		const float *lo = x + 149, *hi = x + 179;
		e[0] = (float)acc;
		for (i = 1; i < 151; i++)
		{
			acc = (double)*lo * *lo + acc;
			acc = acc - (double)*hi * *hi;
			lo--; hi--;
			if (acc < 0.0)
				acc = 0.0;
			e[i] = (float)acc;
		}
	}
	/* FUN_26614001: pick the reference block */
	esum = (float)((double)e[60] + e[30] + e[0]);
	sel = ((double)e[30] < (double)e[0] * 0.5) ? 2 : 1;

	/* FUN_266140b0 */
	En = e + 65;
	cur = xc[sel];
	memcpy(scores, cur, sizeof(xc[sel]));
	memcpy(cur, En - 30 * sel, sizeof(xc[sel]));   /* now the reference block's lagged energies */
	if (sel != 1)
	{
		eblk = En - 30;
		blk = 1;
	}
	else
	{
		eblk = En;
		blk = 0;
	}
	for (; blk < 3; blk++)
	{
		if (blk != sel)
		{
			const float *sc = xc[blk];
			prev_end = 0;
			best = -1;
			bestv = -1.0f;
			for (i = 0; i < VR12_PITCH_NLAG; i++)
			{
				vr12_window_max(sc, ps->start_n[i], ps->len_n[i], &best, &bestv, &prev_end);
				scores[i] = bestv + scores[i];
				cur[i] = cur[i] + eblk[best];
			}
		}
		eblk -= 30;
	}
	vr12_argmax(cur, VR12_PITCH_NLAG, &best, &bestv);
	bestv = (float)(0.25 * bestv + (double)1e-06f);
	for (i = 0; i < VR12_PITCH_NLAG; i++)
	{
		if (cur[i] < bestv)
			cur[i] = bestv;
	}
	/* the original unrolls this by three and stores the divisor as a float; the
	 * two leftover lags divide by the sqrt while it is still on the x87 stack */
	for (i = 0; i + 2 < VR12_PITCH_NLAG; i++)
	{
		float d = (float)sqrt((double)esum * cur[i] + (double)1e-06f);
		scores[i] = scores[i] / d;
	}
	for (; i < VR12_PITCH_NLAG; i++)
		scores[i] = (float)(scores[i] / sqrt((double)esum * cur[i] + (double)1e-06f));

	/* parabolic refinement of clear peaks */
	for (i = 1; i < 16; i++)
	{
		if ((double)0.15f < (double)scores[i] && scores[i - 1] < scores[i] && scores[i + 1] < scores[i])
			vr12_parabola(scores[i - 1], scores[i], scores[i + 1], &scores[i]);
	}
	/* FUN_26614421 */
	for (i = 0; i < VR12_PITCH_NLAG; i++)
		scores[i] = scores[i] * vr12_pitch_weights[i];
}


/* lag selection with the frame-to-frame tracker (FUN_266137f0) */
static int vr12_pitch_select(const float *scores, vr12_pitch_t *ps)
{
	float comb[VR12_PITCH_NLAG];
	float val_a = -1.0f, val_b, bestv = -1.0f, mx;
	int idx_a, idx_b, flag_a = 0, best = -1, prev_end = 0, i, bi = 0, chosen, rel;
	int s7, s1, s6, s2;

	/* FUN_266138fb: best of (window max of this frame + last frame's score)/2 */
	for (i = 0; i < VR12_PITCH_NLAG; i++)
	{
		float c;
		vr12_window_max(scores, ps->start_w[i], ps->len_w[i], &best, &bestv, &prev_end);
		c = (float)(((double)bestv + ps->prev_scores[i]) * 0.5);
		if (val_a < c)
		{
			bi = i;
			val_a = c;
		}
		comb[i] = c;
	}
	idx_a = bi + VR12_PITCH_MIN;
	if (idx_a < 11)
	{
		/* a very short lag: prefer a multiple if the sub-harmonics are weak */
		int i1 = idx_a * 2 - VR12_PITCH_MIN;
		int i2 = i1 + idx_a;
		if ((double)comb[i1] < (double)val_a * 0.5 || (double)comb[i2] < (double)val_a * 0.5)
		{
			i2 = i2 + 1;
			vr12_argmax(comb + i2, VR12_PITCH_NLAG - i2, &rel, &val_a);
			idx_a = rel + VR12_PITCH_MIN + i2;
			flag_a = 1;
		}
	}

	/* FUN_26613c17: continuation of the previous lag */
	s7 = ps->cur_idx - VR12_PITCH_MIN;
	s1 = ps->start_w[s7];
	vr12_argmax(ps->prev_scores + s1, ps->len_w[s7], &rel, &mx);
	val_b = (float)(((double)mx + ps->cur_score) * 0.5);
	s6 = ps->prev_idx - VR12_PITCH_MIN;
	s2 = ps->start_w[s6];
	if (s2 <= s7 && s7 < s2 + ps->len_w[s6])
	{
		float f = (float)((double)mx * 0.4f + (double)ps->cur_score * 0.35f + (double)ps->prev_score * 0.25f);
		if (val_b < f)
			val_b = f;
	}
	idx_b = rel + VR12_PITCH_MIN + s1;

	if (flag_a == 1 && idx_b < 11 && val_b < 0.5f)
		val_b = -1.0f;
	if ((idx_a < idx_b && (double)val_a <= (double)val_b * 0.98f) || (idx_b <= idx_a && (double)val_a * 0.93f <= (double)val_b))
		chosen = idx_b;
	else
		chosen = idx_a;
	ps->prev_idx = ps->cur_idx;
	ps->cur_idx = chosen;
	ps->prev_score = ps->cur_score;
	ps->cur_score = ps->prev_scores[chosen - VR12_PITCH_MIN];
	memcpy(ps->prev_scores, scores, sizeof(ps->prev_scores));
	return chosen;
}

/* raised-cosine taper a - b*cos(2*pi*i/(n-1)) by Chebyshev recurrence (FUN_26616ab4) */
static void vr12_taper(float *x, int n, float a, float b)
{
	double cs = cos((double)6.2831855f / (double)(n - 1));
	float c1 = (float)cs;
	float two = c1 + c1;
	float cprev2 = b, cprev1 = (float)(cs * b), c;
	int half = n >> 1, k;

	x[0] = (float)(((double)a - b) * x[0]);
	x[n - 1] = (float)(((double)a - b) * x[n - 1]);
	x[1] = (float)(((double)a - cprev1) * x[1]);
	x[n - 2] = (float)(((double)a - cprev1) * x[n - 2]);
	for (k = 2; k < half; k++)
	{
		c = (float)((double)two * cprev1 - cprev2);
		x[k] = (float)(((double)a - c) * x[k]);
		x[n - 1 - k] = (float)(((double)a - c) * x[n - 1 - k]);
		cprev2 = cprev1;
		cprev1 = c;
	}
	if (n & 1)
		x[half] = (float)(((double)a + b) * x[half]);
}

/* fractional lag refinement around the chosen candidate (FUN_266134d0), on the
 * history + current decimated signal, returns the lag and its normalised
 * correlation in *corr */
static float vr12_pitch_refine(vr12_pitch_t *ps, const float *xcur, int idx, float *corr)
{
	float buf[180], c[12];
	float best = -3.4028235e+38f, e1, e2, pitch;
	int r, lo, hi, n, half, lag, k = 0, bi = 0, blag;

	r = ftol((double)idx * (double)0.1f + (double)0.5f);
	if (r > 4) r = 4;
	lo = idx - r;
	if (lo < 5) lo = 5;
	hi = idx + r;
	if (hi > 90) hi = 90;
	n = hi * 3;
	if (n < 65) n = 65;
	if (n > 180) n = 180;
	half = n >> 1;
	if (half < 46)
		memcpy(buf, ps->hist + 90 - half, n * sizeof(float));
	else
	{
		memcpy(buf, ps->hist + 90 - half, (half + 45) * sizeof(float));
		memcpy(buf + half + 45, xcur, (n - half - 45) * sizeof(float));
	}
	vr12_taper(buf, n, 0.75f, 0.25f);
	for (lag = lo; lag <= hi; lag++, k++)
	{
		float v = vr12_dot(buf, buf + lag, n - lag);
		c[k + 1] = v;
		if (best < v)
		{
			best = v;
			bi = k;
		}
	}
	blag = bi + lo;
	if (lo < blag && blag < hi)
		pitch = (float)((double)vr12_parabola(c[bi], best, c[bi + 2], corr) + (double)blag);
	else
	{
		pitch = (float)blag;
		*corr = best;
	}
	e1 = vr12_dot(buf, buf, n - blag);
	e2 = vr12_dot(buf + blag, buf + blag, n - blag);
	*corr = (float)((double)vr12_pitch_weights[blag - VR12_PITCH_MIN] / sqrt((double)e1 * (double)e2 + 1e-06) * (double)*corr);
	return pitch;
}

/* speech / voicing decision from the frame level and the pitch correlation
 * (FUN_26613140). *flag = "there is speech" (with hangover), *dec = the raw
 * decision with a five-frame silence rule. */
static void vr12_vad(vr12_vad_t *vd, float energy, float ratio, int16_t *flag, int16_t *dec)
{
	float old = vd->level;
	float lvl = (float)(log10((double)energy) * 10.0);
	float rng, thr;
	int16_t d;

	vd->level = lvl;
	if (ratio > 0.7f)
	{
		vd->maxlev = vd->maxlev - 0.112500004f;
		if (vd->maxlev < old)
			vd->maxlev = old;
	}
	if (vd->count > 4 && ratio < 0.5f)
	{
		vd->minlev = vd->minlev + 0.99999905f;
		if (old < vd->minlev && 10.0f < old)
			vd->minlev = old;
	}
	rng = (float)(((double)vd->maxlev - vd->minlev) * 0.14999998f + (double)vd->range * 0.85f);
	if (vd->prev == 1)
		thr = (float)((double)rng * 0.2f + vd->minlev);
	else
		thr = (float)((double)rng * 0.3f + vd->minlev);
	if (vd->count > 4 && rng < 15.0f)
		vd->minlev = vd->maxlev - 15.0f;
	d = (thr < old || thr < lvl) ? 1 : 0;
	*flag = d;
	if (d != 1)
	{
		if (vd->prev == 1)
		{
			if (15.0f < rng)
			{
				if (rng < 35.0f)
					vd->hang = (int16_t)ftol(-1.5 * (double)rng + 62.5);
				else
					vd->hang = 10;
			}
			else
				vd->hang = 40;
		}
		vd->hang = vd->hang - 1;
		if (vd->hang < 1)
			vd->hang = 0;
		else
			*flag = 1;
	}
	*dec = d;
	if (10.0f < rng && 0.513f < ratio)
		*dec = 1;
	if (*dec == 1)
		vd->silence = 0;
	else
	{
		if (vd->silence < 5)
			*dec = 1;
		vd->silence = vd->silence + 1;
		if (vd->silence > 5)
			vd->silence = 5;
	}
	vd->count = vd->count + 1;
	if (vd->count > 4)
		vd->count = 5;
	vd->prev = d;
	vd->range = rng;
}

/* the pitch estimator (FUN_2660de60): x = 180 DC-removed samples, modified in
 * place. Returns the pitch period at 8 kHz; *speech and *dec from the VAD. */
static float vr12_pitch_estimate(float *x, vr12_pitch_t *ps, int16_t *speech, int16_t *dec)
{
	float scores[VR12_PITCH_NLAG];
	float energy, pitch, corr, ratio;
	int i, idx;

	for (i = 0; i < VR12_FRAME; i++)
		x[i] = x[i] + 0.1f;
	vr12_iir(x, x, VR12_FRAME, vr12_pitch_hp, 4, ps->hp_state);
	energy = (float)(vr12_dotd(x, x, VR12_FRAME) / 180.0);
	vr12_pitch_weight(x, VR12_FRAME, ps);
	vr12_iir(x, x, VR12_FRAME, vr12_pitch_lp, 3, ps->lp_state);
	/* 2:1 decimation into the upper half; the lower half becomes history */
	for (i = 0; i < 90; i++)
		x[179 - i] = x[178 - 2 * i];
	memcpy(x, ps->hist + 45, 90 * sizeof(float));
	vr12_pitch_scores(x, ps, scores);
	idx = vr12_pitch_select(scores, ps);
	pitch = vr12_pitch_refine(ps, x + 90, idx, &corr);
	if (ps->cur_score < corr)
		ps->cur_score = corr;
	if (corr <= 0.01f)
	{
		ps->cur_score = -1.0f;
		ps->cur_idx = ps->prev_idx;
		pitch = (float)ps->prev_idx;
	}
	memmove(ps->hist, ps->hist + 90, 45 * sizeof(float));
	memcpy(ps->hist + 45, x + 90, 90 * sizeof(float));
	ratio = corr / vr12_pitch_weights[ftol((double)pitch + (double)0.5f) - VR12_PITCH_MIN];
	vr12_vad(&ps->vad, energy, ratio, speech, dec);
	return (float)(2.0 * (double)pitch);
}

/* -------------------------------------------------------------------------- */
/* harmonic analysis on the 512-point spectrum                                 */

/* fixed-point walk over the harmonics of `pitch`: bins per harmonic in 10.22,
 * kernel step from the window length (FUN_26614e50 / FUN_26615165 share this) */
static int vr12_kernel_step(float pitch, int wlen)
{
	int step = (int)lrintf((float)((double)(wlen - 1) * 0.14545454f));
	if (pitch < 9.0f)
		step = step - 1;
	if ((double)pitch * 1036.0 < (double)step * 256.0)
		step = 32;
	return step;
}

/* template-matching error of the harmonics between bins 3 and 64 (FUN_26614e50) */
static float vr12_harm_error(float pitch, const float *re, const float *im, int wlen)
{
	int step = vr12_kernel_step(pitch, wlen);
	int inc = (int)lrintf((512.0f / pitch) * 4194304.0f);
	int halfinc = (int)lrintf((512.0f / pitch) * 0.5f * 4194304.0f);
	int h0 = (int)lrintf((float)(3.0 * pitch * 0.001953125));
	int h1 = (int)lrintf((float)(64.0 * pitch * 0.001953125));
	float err = 1e-06f;
	int acc, lo, hi, centre, k, t, h;

	if ((h1 * inc + 0x200000) >> 22 > 255)
		h1 = h1 - 1;
	acc = (h0 - 1) * inc;
	lo = (acc + 0x200000 + halfinc) >> 22;
	if (lo < 3)
		lo = 3;
	for (h = h0; h <= h1; h++)
	{
		float cr, ci;
		acc = acc + inc;
		hi = (acc + 0x200000 + halfinc) >> 22;
		if (hi > 64)
			hi = 64;
		centre = (acc + 0x200000) >> 22;
		cr = re[centre];
		ci = im[centre];
		k = lo;
		for (t = -step * lo + ((step * (acc >> 6) - 0x8000) >> 16); t >= 0; t -= step)
		{
			float a = (float)((double)re[k] - (double)cr * vr12_harm_kernel[t]);
			float b = (float)((double)im[k] - (double)ci * vr12_harm_kernel[t]);
			if (a <= 0.0f) a = -a;
			if (b <= 0.0f) b = -b;
			err = (float)((double)a + b + err);
			k++;
		}
		t = -t;
		for (; k < hi; k++)
		{
			float a = (float)((double)re[k] - (double)cr * vr12_harm_kernel[t]);
			float b = (float)((double)im[k] - (double)ci * vr12_harm_kernel[t]);
			if (a <= 0.0f) a = -a;
			if (b <= 0.0f) b = -b;
			err = (float)((double)a + b + err);
			t += step;
		}
		lo = hi;
	}
	return err;
}

/* per-harmonic residual-to-energy ratio after removing the template
 * (FUN_26615165); the voicing decision thresholds these */
static int vr12_harm_residuals(float pitch, const float *re, const float *im, const float *power, int wlen, float *out)
{
	int step = vr12_kernel_step(pitch, wlen);
	int halfinc = (int)lrintf((512.0f / pitch) * 0.5f * 4194304.0f);
	int nh = vr12_nharm(pitch);
	int acc = 0, lo, hi, centre, k, t, h;

	if (nh > VR12_NHARM_MAX)
		nh = VR12_NHARM_MAX;
	lo = (halfinc + 0x200000) >> 22;
	for (h = 0; h < nh; h++)
	{
		float cr, ci, err = 1e-06f, pw = 1e-06f;
		acc = acc + (int)lrintf((512.0f / pitch) * 4194304.0f);
		hi = (acc + 0x200000 + halfinc) >> 22;
		if (hi > 255)
			hi = 255;
		centre = (acc + 0x200000) >> 22;
		cr = re[centre];
		ci = im[centre];
		k = lo;
		for (t = -step * lo + ((step * (acc >> 6) - 0x8000) >> 16); t >= 0; t -= step)
		{
			float a = (float)((double)re[k] - (double)cr * vr12_harm_kernel[t]);
			float b = (float)((double)im[k] - (double)ci * vr12_harm_kernel[t]);
			err = (float)((double)b * b + (double)a * a + err);
			pw = pw + power[k];
			k++;
		}
		t = -t;
		for (; k < hi; k++)
		{
			float a = (float)((double)re[k] - (double)cr * vr12_harm_kernel[t]);
			float b = (float)((double)im[k] - (double)ci * vr12_harm_kernel[t]);
			err = (float)((double)b * b + (double)a * a + err);
			pw = pw + power[k];
			t += step;
		}
		lo = hi;
		out[h] = err / pw;
	}
	return nh;
}

/* pitch refinement by template matching, +-1.5 then +-0.5 samples
 * (FUN_2660efc0); writes the per-harmonic residuals for the voicing decision */
static void vr12_harm_fit(float *pitch, const float *re, const float *im, const float *power, int wlen, float *amps)
{
	float best, bestv = 3.4028235e+38f, base, cand, e;
	int i;

	if (*pitch < 8.0f)
		*pitch = 8.0f;
	best = *pitch;
	for (i = 0; i < 5; i++)
	{
		cand = *pitch + vr12_pitch_off1[i];
		e = cand < 8.0f ? 3.4028235e+38f : vr12_harm_error(cand, re, im, wlen);
		if (e < bestv)
		{
			bestv = e;
			best = cand;
		}
	}
	base = best;
	for (i = 0; i < 4; i++)
	{
		cand = base + vr12_pitch_off2[i];
		e = cand < 8.0f ? 3.4028235e+38f : vr12_harm_error(cand, re, im, wlen);
		if (e < bestv)
		{
			bestv = e;
			best = cand;
		}
	}
	if (best > 182.0f)
		best = 182.0f;
	vr12_harm_residuals(best, re, im, power, wlen, amps);
	*pitch = best;
}

/* per-harmonic voicing decision and the voicing fraction (FUN_2660e8d0) */
static float vr12_voicing(float pitch, vr12_vstate_t *vs, const float *power, const float *amps, int wlen, int16_t speech)
{
	float level = vs->level, prevv = vs->prev_voicing;
	float scale = (float)(1.0 / ((double)wlen * 256.0));
	float lowE = 1e-06f, highE = 1e-06f, tot, r, sq, f65, thr0, v;
	int nh = vr12_nharm(pitch), i, cnt = 0;

	for (i = 0; i < 128; i++)
		lowE = lowE + power[i];
	lowE = lowE * scale;
	for (; i < 256; i++)
		highE = highE + power[i];
	highE = highE * scale;
	tot = lowE + highE;
	if (tot < 1e-06f)
		v = 0.0f;
	else
	{
		if (tot <= level)
			level = (float)(((double)tot - level) * 0.01f + level);
		else
			level = (float)(((double)tot + level) * 0.5);
		if (level > 40000.0f)
			level = 40000.0f;
		r = (float)(((double)level * 0.005f + tot) / ((double)level * 0.01f + tot));
		sq = (float)sqrt((double)lowE / (5.0 * highE));
		if (sq > 1.0f)
			sq = 1.0f;
		f65 = (float)(65.0 / pitch);
		if (f65 > 1.0f)
			f65 = 1.0f;
		thr0 = (float)((double)f65 * sq * r);
		for (i = 0; i < nh; i++)
		{
			float thr = (float)((double)thr0 - (double)i * (((double)thr0 * 1.9452741f) / pitch));
			if (prevv >= 0.85f)
				thr = thr * 0.95f;
			else if (vs->flags[i] == 1 && prevv >= 0.65f)
				thr = thr * 0.9f;
			else if (vs->flags[i] == 1 && prevv >= 0.5f)
				thr = thr * 0.85f;
			else if (vs->flags[i] == 1)
				thr = thr * 0.75f;
			else
				thr = thr * 0.65f;
			if (thr <= amps[i])
				vs->flags[i] = 0;
			else
			{
				vs->flags[i] = 1;
				cnt++;
			}
		}
		for (; i < VR12_NHARM_MAX; i++)
			vs->flags[i] = 0;
		v = (float)cnt / (float)nh;
		if (v > 1.0f)
			v = 1.0f;
		tot = tot / level;
		lowE = lowE / highE;
		sq = sq * r;
		if (tot < 0.0001f
		    || (tot < 0.0005f && lowE < 150.0f)
		    || (tot < 0.0012f && lowE < 20.0f)
		    || (tot < 0.021f && lowE < 1.27f && sq < 0.35f && prevv == 0.0f)
		    || (tot < 0.02f && lowE < 1.13f && sq < 0.22f && prevv == 0.0f)
		    || (tot < 0.02f && lowE < 1.13f && sq < 0.28f && prevv < 0.12f)
		    || (tot < 0.023f && lowE < 1.0f && sq < 0.19f && prevv < 0.12f)
		    || (tot < 0.041f && lowE < 0.3f && sq < 0.15f && prevv == 0.0f)
		    || (tot < 0.115f && lowE < 0.62f && sq < 0.34f && prevv == 0.0f && pitch > 100.0f)
		    || (tot < 0.043f && lowE < 2.1f && sq < 0.58f && prevv == 0.0f && pitch > 110.0f))
			v = 0.0f;
		if (speech == 0)
			v = 0.0f;
	}
	if (v == 0.0f)
	{
		for (i = 0; i < VR12_NHARM_MAX; i++)
			vs->flags[i] = 0;
	}
	vs->prev_voicing = v;
	vs->level = level;
	return v;
}

/* voicing hysteresis against the pitch tracker's confidence (FUN_2660e7cd) */
static float vr12_voicing_smooth(float v, float prev_v, float lag, float score, const float *weights)
{
	float ratio = score / weights[ftol((double)lag + (double)0.5f) - VR12_PITCH_MIN];
	float out = v;

	if (ratio < 0.0f) ratio = 0.0f;
	if (ratio > 1.0f) ratio = 1.0f;
	if (ratio <= 0.6f || v <= 0.1f)
	{
		if ((double)0.16f <= (double)v * ratio || 0.6f <= ratio)
		{
			if (0.4f < v && 0.4f < ratio)
				out = (float)sqrt((double)v);
		}
		else if (prev_v < 0.4f)
			out = 0.0f;
	}
	else
		out = (float)(((double)v + ratio) * 0.5);
	return out;
}

/* -------------------------------------------------------------------------- */
/* quantisation                                                                */

/* weighted squared distance (FUN_2660c9b0), x87 accumulation over blocks of 5 */
static float vr12_vq_dist(const float *w, const float *cb, const float *x, int n)
{
	double acc = 0.0, part = 0.0;
	do
	{
		acc = acc + part;
		part = ((double)cb[4] - x[4]) * ((double)cb[4] - x[4]) * w[4]
		     + ((double)cb[3] - x[3]) * ((double)cb[3] - x[3]) * w[3];
		acc = ((double)cb[0] - x[0]) * ((double)cb[0] - x[0]) * w[0] + acc
		    + ((double)cb[1] - x[1]) * ((double)cb[1] - x[1]) * w[1]
		    + ((double)cb[2] - x[2]) * ((double)cb[2] - x[2]) * w[2];
		w += 5; cb += 5; x += 5; n -= 5;
	} while (n != 0);
	return (float)(acc + part);
}

/* multi-stage VQ of the LSFs (FUN_2660b970): weights from the LPC spectrum at
 * each LSF, a 16-survivor tree search over `nstage` stages, then the candidate
 * whose reconstruction keeps the 0.01 spacing. lsf (Hz) is replaced by the
 * quantised set; a = lpc[1..]. */
static void vr12_vq_search(float *lsf, const float *a, int16_t *idx_out, vr12_vq_t *ws, int nstage)
{
	const int N = VR12_LPC_ORDER, M = VR12_VQ_M, CB = VR12_VQ_CB;
	float w[VR12_LPC_ORDER];
	float *rows = ws->rows_a, *resid = ws->rows_b, *tmpf;
	int16_t *idx_cur = ws->idx_b, *idx_prev = ws->idx_a, *tmpi;
	float *recon = ws->rows_a;
	int i, s, j, c, k, nsurv, nnew, pick, spaced;

	for (i = 0; i < N; i++)
		rows[i] = (float)((double)lsf[i] / 4000.0);

	/* spectral weights */
	for (i = 0; i < N; i++)
	{
		float cs = (float)cos((double)rows[i] * 3.141592654);
		float sn = (float)sin((double)rows[i] * 3.141592654);
		float ms = -sn;
		float A0 = (float)(-(double)a[N - 1] * N * cs);
		float A1 = (float)(-(double)a[N - 1] * cs);
		float B0 = (float)(-(double)a[N - 1] * N * ms);
		float B1 = (float)(-(double)a[N - 1] * ms);
		float re, im, mag;
		for (k = N - 2; k >= 0; k--)
		{
			float f6 = (float)(-(double)a[k] * (k + 1) + A0);
			float f7 = (float)(-(double)a[k] + A1);
			A0 = (float)((double)cs * f6 - (double)ms * B0);
			A1 = (float)((double)cs * f7 - (double)ms * B1);
			B0 = (float)((double)ms * f6 + (double)B0 * cs);
			B1 = (float)((double)ms * f7 + (double)B1 * cs);
		}
		re = (float)(1.0 - A1);
		im = -B1;
		mag = (float)((double)im * im + (double)re * re);
		if (1.17549e-38f < mag)
		{
			if (mag < 3.40282e+38f)
			{
				float f7 = (float)((double)A0 * re - (double)(-B0) * im);
				w[i] = (float)(((double)f7 + f7) / mag + N + 1.0);
				if (w[i] <= 180.0f)
				{
					if (w[i] <= 11.0f)
						w[i] = (float)((double)w[i] * 0.02247f);
					else
						w[i] = (float)sqrt((double)w[i] / 180.0);
				}
				else
					w[i] = 1.0f;
			}
			else
				w[i] = (float)((double)(N + 1) * 0.02247f);
		}
		else
			w[i] = 1.0f;
		if (0.25f < rows[i])
			w[i] = (float)((1.0 - (((double)rows[i] - 0.25f) + ((double)rows[i] - 0.25f)) / 3.0) * w[i]);
	}

	memset(ws->idx_a, 0, sizeof(ws->idx_a));
	memset(ws->idx_b, 0, sizeof(ws->idx_b));
	nsurv = 1;
	for (s = 0; s < nstage; s++)
	{
		const float *stage_cb = vr12_lsf_codebooks + s * CB * N;
		const float *cur = rows;
		for (j = 0; j < M; j++)
			ws->dist[j] = 3.4028228e+38f;
		for (j = 0; j < nsurv; j++)
		{
			const float *cb = stage_cb;
			for (c = 0; c < CB; c++)
			{
				float d = vr12_vq_dist(w, cb, cur, N);
				if (d < ws->dist[M - 1])
				{
					for (k = M - 1; k > 0 && d <= ws->dist[k - 1]; k--)
					{
						ws->dist[k] = ws->dist[k - 1];
						ws->pair[k][0] = ws->pair[k - 1][0];
						ws->pair[k][1] = ws->pair[k - 1][1];
					}
					ws->dist[k] = d;
					ws->pair[k][0] = (int16_t)j;
					ws->pair[k][1] = (int16_t)c;
				}
				cb += N;
			}
			cur += N;
		}
		nnew = nsurv * CB;
		if (nnew > M)
			nnew = M;
		nsurv = nnew;
		for (k = 0; k < nnew; k++)
		{
			int sj = ws->pair[k][0], sc = ws->pair[k][1];
			const float *cbv = stage_cb + sc * N;
			idx_cur[k * nstage + s] = (int16_t)sc;
			for (i = 0; i < s; i++)
				idx_cur[k * nstage + i] = idx_prev[sj * nstage + i];
			for (i = 0; i < N; i++)
				resid[k * N + i] = rows[sj * N + i] - cbv[i];
		}
		tmpi = idx_cur; idx_cur = idx_prev; idx_prev = tmpi;
		tmpf = rows; rows = resid; resid = tmpf;
	}
	/* idx_prev now holds the final index lists; reconstruct every survivor */
	for (k = 0; k < M; k++)
	{
		for (i = 0; i < N; i++)
			recon[k * N + i] = 0.0f;
		for (s = 0; s < nstage; s++)
		{
			const float *cbv = vr12_lsf_codebooks + s * CB * N + idx_prev[k * nstage + s] * N;
			for (i = 0; i < N; i++)
				recon[k * N + i] = recon[k * N + i] + cbv[i];
		}
	}
	/* the decoder's broken insertion sort, applied to the best candidate only */
	for (i = 1; i < N && recon[i - 1] <= recon[i]; i++)
		;
	if (i < N && recon[i] < recon[i - 1])
	{
		for (j = 2; j <= N; j++)
		{
			for (k = j - 1; k > 0 && recon[j - 1] < recon[k - 1]; k--)
				recon[k] = recon[k - 1];
			recon[k] = recon[j - 1];
		}
	}
	/* first candidate whose LSFs keep the 0.01 spacing; else force it on the best */
	pick = 0;
	spaced = 0;
	for (k = 0; k < M; k++)
	{
		spaced = 1;
		for (i = 1; i < N; i++)
		{
			if ((double)recon[k * N + i] - recon[k * N + i - 1] < (double)0.01f)
				spaced = 0;
		}
		if (spaced)
		{
			pick = k;
			break;
		}
	}
	if (!spaced)
	{
		/* (the original tests a row past the end of the table here and repairs
		 * row 0; the repair is what matters) */
		for (i = 1; i < N; i++)
		{
			if ((double)recon[i] - recon[i - 1] < (double)0.01f)
				recon[i] = recon[i - 1] + 0.01f;
		}
	}
	for (i = 0; i < N; i++)
		lsf[i] = (float)((double)recon[pick * N + i] * 4000.0);
	for (s = 0; s < nstage; s++)
		idx_out[s] = idx_prev[pick * nstage + s];
}

/* nearest gain-table index of log10(gain) (FUN_2660b8d0 / FUN_266130b0) */
static int16_t vr12_gain_quant(float gain)
{
	float lg, best, d;
	int i, bi = 0;

	if (gain == 0.0f)
		gain = 1e-07f;
	lg = (float)log10((double)gain);
	best = (float)(((double)lg - vr12_gain_table[0]) * ((double)lg - vr12_gain_table[0]));
	for (i = 1; i < 32; i++)
	{
		d = (float)(((double)lg - vr12_gain_table[i]) * ((double)lg - vr12_gain_table[i]));
		if (d < best)
		{
			best = d;
			bi = i;
		}
	}
	return (int16_t)bi;
}

/* log pitch index, the inverse of vr12_pitch_dequant (FUN_2660b7d0) */
static int16_t vr12_pitch_quant(float pitch)
{
	double base;
	uint64_t bits = 0x3ff061c44de70272ull;
	int idx;
	memcpy(&base, &bits, 8);
	idx = ftol(floor(log10(160.0 / (double)pitch) / log10(base) + 0.5));
	if (idx > 127) idx = 127;
	if (idx < 0) idx = 0;
	return (int16_t)idx;
}

/* linear voicing index (FUN_2660b770 / FUN_26613080) */
static int16_t vr12_voicing_quant(float v)
{
	float x = (float)(((double)v - 0.05) * 10.76923076923077 + 0.25);
	return (int16_t)ftol(floor((double)x + (double)0.5f));
}

/* FUN_26608b90 */
static void vr12_enc_quantise(vr12_encoder_t *e)
{
	vr12_eparams_t *p = &e->p;

	if (p->speech == 0)
		e->frame_type = 3;
	else if (0.05 < (double)p->voicing)
		e->frame_type = (0.7 <= (double)p->voicing) ? 0 : 1;
	else
		e->frame_type = 2;

	if (e->frame_type == 2)
	{
		vr12_lpc_to_lsf(p->lpc, VR12_LPC_ORDER, 8000.0f, p->lsf);
		vr12_vq_search(p->lsf, p->lpc + 1, e->lsf_idx, &e->vq, 2);
		e->gain_idx = vr12_gain_quant(p->gain);
	}
	if (e->frame_type == 1)
	{
		e->pitch_idx = vr12_pitch_quant(p->pitch);
		vr12_lpc_to_lsf(p->lpc, VR12_LPC_ORDER, 8000.0f, p->lsf);
		vr12_vq_search(p->lsf, p->lpc + 1, e->lsf_idx, &e->vq, 6);
		e->voicing_idx = vr12_voicing_quant(p->voicing);
		e->gain_idx = vr12_gain_quant(p->gain);
	}
	if (e->frame_type == 0)
	{
		e->pitch_idx = vr12_pitch_quant(p->pitch);
		vr12_lpc_to_lsf(p->lpc, VR12_LPC_ORDER, 8000.0f, p->lsf);
		vr12_vq_search(p->lsf, p->lpc + 1, e->lsf_idx, &e->vq, 6);
		e->gain_idx = vr12_gain_quant(p->gain);
	}
}

/* bit writer (FUN_2660b4b0), LSB first into a zeroed 6-byte frame */
typedef struct {
	uint8_t *out;
	int bytepos, bitpos;
} vr12_bitw_t;

static void vr12_bits_write(vr12_bitw_t *b, unsigned v, int nbits)
{
	if (b->bitpos == 0)
		b->out[b->bytepos] = (uint8_t)v;
	else
		b->out[b->bytepos] |= (uint8_t)(v << b->bitpos);
	b->bitpos += nbits;
	if (b->bitpos < 9)
	{
		if (b->bitpos == 8)
		{
			b->bitpos = 0;
			b->bytepos++;
		}
	}
	else
	{
		b->bytepos++;
		b->out[b->bytepos] = (uint8_t)(v >> (8 - (b->bitpos - nbits)));
		b->bitpos -= 8;
	}
}

/* FUN_26608820 */
static void vr12_enc_pack(const vr12_encoder_t *e, uint8_t *out6)
{
	vr12_bitw_t b = { out6, 0, 0 };
	int i;

	memset(out6, 0, 6);
	vr12_bits_write(&b, (unsigned)e->frame_type, 2);
	if (e->frame_type == 2)
	{
		for (i = 0; i < 2; i++)
			vr12_bits_write(&b, (unsigned)e->lsf_idx[i], 4);
		vr12_bits_write(&b, (unsigned)e->gain_idx, 5);
	}
	if (e->frame_type == 1)
	{
		vr12_bits_write(&b, (unsigned)e->voicing_idx, 3);
		vr12_bits_write(&b, (unsigned)e->pitch_idx, 7);
		for (i = 0; i < 6; i++)
			vr12_bits_write(&b, (unsigned)e->lsf_idx[i], 4);
		vr12_bits_write(&b, (unsigned)e->gain_idx, 5);
	}
	if (e->frame_type == 0)
	{
		vr12_bits_write(&b, (unsigned)e->pitch_idx, 7);
		for (i = 0; i < 6; i++)
			vr12_bits_write(&b, (unsigned)e->lsf_idx[i], 4);
		vr12_bits_write(&b, (unsigned)e->gain_idx, 5);
	}
}

/* -------------------------------------------------------------------------- */
/* analysis (FUN_26609580)                                                     */
static void vr12_enc_analyse(vr12_encoder_t *e, const int16_t *pcm)
{
	float tmp[VR12_FFT_MAX + 2];
	float spec[VR12_FFT_MAX + 2];
	float re[256], im[256], power[256], amps[VR12_NHARM_MAX];
	float ac[11], k[10], pitch, voicing, prev_out, prev_in, inv;
	const float *win;
	int16_t speech, dec;
	int i, wlen, half, start;
	vr12_eparams_t *p = &e->p;

	/* DC removal (FUN_2660f6b0): y = 0.99 y + (x - x_prev) */
	prev_out = e->pre_out;
	if ((prev_out < 0.0f ? -prev_out : prev_out) < 1e-05f)
		prev_out = 0.0f;
	prev_in = e->pre_in;
	for (i = 0; i < VR12_FRAME; i++)
	{
		float s = (float)pcm[i];
		prev_out = (float)(0.99f * (double)prev_out + ((double)s - prev_in));
		tmp[i] = prev_out;
		prev_in = s;
	}
	e->pre_in = prev_in;
	e->pre_out = prev_out;

	/* into the ring (FUN_2660f506) */
	for (i = 0; i < VR12_FRAME; i++)
		e->ring[(e->ring_pos + i) % VR12_ENC_RING] = tmp[i];
	e->ring_pos = (e->ring_pos + VR12_FRAME) % VR12_ENC_RING;

	pitch = vr12_pitch_estimate(tmp, &e->ps, &speech, &dec);
	p->speech = speech;

	/* analysis window by pitch (FUN_26609cf9 -- 241 is unreachable there too) */
	if (pitch <= 43.0f)
		wlen = pitch <= 60.0f ? 221 : 241;
	else
		wlen = 261;
	e->wlen = (int16_t)wlen;
	win = wlen == 221 ? vr12_enc_win221 : wlen == 241 ? vr12_enc_win241 : vr12_enc_win261;

	/* extract wlen samples centred 270 back (FUN_2660f5ce) */
	half = (wlen + 1) >> 1;
	start = ((e->ring_pos + (-(270 + half)) % VR12_ENC_RING) + VR12_ENC_RING) % VR12_ENC_RING;
	for (i = 0; i < wlen; i++)
		tmp[i] = e->ring[(start + i) % VR12_ENC_RING];
	vr12_window(tmp, win, tmp, wlen);

	/* LPC (FUN_2660f2f0) */
	vr12_autocorr(11, tmp, wlen, ac);
	vr12_levinson(ac, VR12_LPC_ORDER, p->lpc, k, &p->gain);
	inv = (float)(1.0 / (double)wlen);
	p->gain = (float)(1.0 / (double)wlen * (double)p->gain);
	vr12_scale(ac, 11, inv, ac);
	vr12_bwexpand(p->lpc, p->lpc, VR12_LPC_ORDER, 0.994f);

	/* zero-phase 512-point spectrum (FUN_2660f250) */
	{
		int h = wlen >> 1;
		memcpy(spec + VR12_FFT_MAX - h, tmp, h * sizeof(float));
		memcpy(spec, tmp + h, (wlen - h) * sizeof(float));
		memset(spec + (wlen - h), 0, (VR12_FFT_MAX - wlen) * sizeof(float));
		vr12_rfft(spec, 9);
	}
	for (i = 0; i < 256; i++)
	{
		re[i] = spec[2 * i];
		im[i] = spec[2 * i + 1];
		power[i] = (float)((double)im[i] * im[i] + (double)re[i] * re[i]);
	}

	vr12_harm_fit(&pitch, re, im, power, wlen, amps);
	voicing = vr12_voicing(pitch, &e->vs, power, amps, wlen, p->speech);
	voicing = vr12_voicing_smooth(voicing, e->prev_voicing, (float)e->ps.cur_idx, e->ps.cur_score, vr12_pitch_weights);
	if (dec != 1)
		voicing = 0.0f;
	e->prev_voicing = voicing;
	if (voicing == 0.0f)
		pitch = 125.0f;
	p->pitch = pitch;
	p->voicing = voicing;
	e->prev_pitch = pitch;
	for (i = 0; i < VR12_LPC_ORDER; i++)
		p->lpcneg[i] = -p->lpc[i + 1];
}

/* -------------------------------------------------------------------------- */
/* encoder API                                                                 */

vr12_encoder_t *vr12_encoder_create(void)
{
	vr12_encoder_t *e = (vr12_encoder_t *)calloc(1, sizeof(*e));
	if (!e)
		return NULL;
	vr12_encoder_reset(e);
	return e;
}

void vr12_encoder_destroy(vr12_encoder_t *e)
{
	free(e);
}

void vr12_encoder_reset(vr12_encoder_t *e)
{
	vr12_pitch_t *ps = &e->ps;
	double step;
	float f;
	int i, d;

	memset(e, 0, sizeof(*e));
	/* FUN_2660eec5 */
	e->vs.level = 1000000.0f;
	/* FUN_2660e0d1 */
	for (i = 0; i < VR12_PITCH_NLAG; i++)
		ps->prev_scores[i] = -1.0f;
	f = 0.0f;
	for (i = 0; i < 10; i++)
	{
		f = f + 363.6f;
		ps->prev_lsf[i] = f;
	}
	ps->cur_idx = ps->prev_idx = 40;
	ps->cur_score = ps->prev_score = -1.0f;
	/* the 180-sample window: the rising half of a 270-point Hamming, then the
	 * falling half of a 90-point one (FUN_26614d59 / FUN_26614dcc) */
	step = 6.283185307179586 / (270.0 - 1.0);
	for (i = 0; i < 135; i++)
		ps->win[i] = (float)(0.54 - cos((double)i * step) * 0.46);
	step = 6.283185307179586 / (90.0 - 1.0);
	for (i = 45; i < 90; i++)
		ps->win[135 + i - 45] = (float)(0.54 - cos((double)i * step) * 0.46);
	for (i = 0; i < VR12_PITCH_NLAG; i++)
	{
		int lo, hi;
		d = ftol((double)(i + 5) * (double)0.155f + 0.5);
		lo = i - d; if (lo < 0) lo = 0;
		hi = i + d; if (hi > 85) hi = 85;
		ps->start_n[i] = lo;
		ps->len_n[i] = hi - (lo - 1);
		d = ftol((double)(i + 5) * 0.25 + 0.5);
		lo = i - d; if (lo < 0) lo = 0;
		hi = i + d; if (hi > 85) hi = 85;
		ps->start_w[i] = lo;
		ps->len_w[i] = hi - (lo - 1);
	}
	/* FUN_2661341c */
	ps->vad.level = 50.0f;
	ps->vad.maxlev = 70.0f;
	ps->vad.minlev = 50.0f;
	ps->vad.prev = 1;
	ps->vad.range = 20.0f;
	e->prev_pitch = 0.0f;
	e->prev_voicing = 0.0f;
}

/* one 180-sample frame -> 6 bytes (FUN_26607bbc) */
static void vr12_encode_frame(vr12_encoder_t *e, const int16_t *pcm180, uint8_t *out6)
{
	vr12_enc_analyse(e, pcm180);
	vr12_enc_quantise(e);
	vr12_enc_pack(e, out6);
}

int vr12_encode_hl_frame(vr12_encoder_t *e, const int16_t *pcm360, uint8_t *out12)
{
	vr12_encode_frame(e, pcm360, out12);
	vr12_encode_frame(e, pcm360 + VR12_FRAME, out12 + 6);
	return 12;
}

int vr12_encode_frame6(vr12_encoder_t *e, const int16_t *pcm180, uint8_t *out6)
{
	vr12_encode_frame(e, pcm180, out6);
	return 6;
}
