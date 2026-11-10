// A second model of the voice channel, for tests/voice-channel.verify.mjs to compare
// voice-channel.js against, operation by operation.
//
// It is written from the work order's pseudo-code (docs/work-orders/W3-02-receiver-queue.md,
// "The model") with plain arrays: the queue is an array that grows at its end and is cut at
// its front, so nothing here wraps, and an error in the module's ring arithmetic (its read and
// write positions, or a drop across the ring's end) cannot be mirrored here. It started from
// the W3-02a review's model, which was written from the order before the module was read.
//
// Where the order names a field but not its exact content, it follows the module's readings
// (docs/reports/W3-02a-voice-channel.md, "Readings of the order"): a tag that is not a number
// is -1; pulled counts every sample a pull returned; an overflow's drops are runs of one tag,
// the old queue's samples and the packet's own counted apart (so a packet longer than the
// ring is an entry of its own).
export function referenceWaitTicks(bufferMs, fps) {
  const b = Math.min(5000, Math.max(1, bufferMs));
  const f = Math.min(1000, Math.max(10, fps));
  return Math.ceil(b / 1000 * f - 1e-6);
}

export function referenceLatency(bufferMs, fps) {
  return Math.min(0.5, (referenceWaitTicks(bufferMs, fps) - 1) * 0.015 + 0.16);
}

export function createReferenceChannel({ fps = 300, bufferMs = 100, fadeTime = 0.1, gain = null, test = {} } = {}) {
  const size = test.ring ?? 22050;
  const wait = test.waitTicks ?? referenceWaitTicks(bufferMs, fps);
  const fade = Math.max(2, Math.floor(44100 * fadeTime));
  let q = [], qt = [];                                    // the queued samples and their tags, oldest first
  let inUse = false, playing = false, starved = false, left = 0, opens = 0, dropped = 0, pulled = 0;
  const drops = [];
  const runs = (tags) => {                                // runs of one tag, in order
    for (let i = 0; i < tags.length;) {
      let j = i + 1;
      while (j < tags.length && tags[j] === tags[i]) j++;
      drops.push({ pulled, count: j - i, tag: tags[i] });
      i = j;
    }
  };
  return {
    get inUse() { return inUse; },
    get playing() { return playing; },
    get starved() { return starved; },
    get count() { return q.length; },
    get opens() { return opens; },
    get waitTicks() { return wait; },
    get dropped() { return dropped; },
    get drops() { return drops.map((d) => ({ ...d })); },
    add(pcm, tag) {
      const label = typeof tag === 'number' ? tag : -1;
      if (!inUse) { inUse = true; q = []; qt = []; left = wait; playing = false; opens++; if (gain) gain.reset(); }
      if (gain) pcm = gain.process(pcm);
      const old = q.length;
      for (let i = test.keepSample ? 0 : 1; i < pcm.length; i++) { q.push(Math.fround(pcm[i])); qt.push(label); }
      if (q.length > size) {
        const lost = q.length - size, fromOld = Math.min(lost, old);
        const gone = qt.slice(0, lost);
        q = q.slice(lost); qt = qt.slice(lost);
        dropped += lost;
        runs(gone.slice(0, fromOld));
        runs(gone.slice(fromOld));
      }
      starved = false;
    },
    tick() {
      if (!inUse) return;
      if (starved) { inUse = false; playing = false; return; }
      if (!playing) { left -= 1; if (left <= 0) playing = true; }
    },
    pull(n) {
      const samples = new Float32Array(n), tags = new Float64Array(n).fill(-1);
      pulled += n;
      if (!(inUse && playing)) return { samples, tags };
      const got = Math.min(n, q.length);
      const s = q.slice(0, got), t = qt.slice(0, got);
      q = q.slice(got); qt = qt.slice(got);
      const after = q.length;
      for (let i = 0; i < got; i++) {
        const r = (got - 1 - i) + after;                   // samples still queued behind this one
        if (after < fade && r < fade - 1) s[i] = Math.fround(s[i] * (r / (fade - 1)));
        samples[i] = s[i];
        tags[i] = t[i];
      }
      const k = Math.min(got, n - got);                    // an underrun: the last k read, once more
      for (let i = 0; i < k; i++) samples[got + i] = s[got - k + i];
      if (q.length === 0) { starved = true; if (test.noGrace) { inUse = false; playing = false; } }
      return { samples, tags };
    },
  };
}
