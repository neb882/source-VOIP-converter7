// A second model of BC-4's arrival times (docs/work-orders/BC-4-jitter-arrivals.md, "The model", with step 3 as
// "After the plan review" states it, the lists started at tick -200 and the look times as functions), written
// from the order's words for tests/render-channel.verify.mjs. It shares no code with engine/network.js: each list is
// an array of packets, every look of both lists is visited in time order, the head is tested, and a packet that
// leaves is handed on. Both models compute a look's time as 15 * k (the server's socket) and k * 1000 / fps (the
// listener's), a packet's age as the look's time less its entry, and the two tests as `age < lag - j` and
// `age >= lag + (2u - 1) j`, so the two can agree to the last bit.
//
// referenceArrivals({ jitterMs, fps, seed, ticks }) -> { floorTicks, at: Int32Array }: for each sender tick p from 0
// to ticks - 1, the tick its message reaches the voice channel less floorTicks. With jitterMs 0 or less, at[p] = p,
// but where a frame is longer than a tick (W3-23a, below).
//
// W3-23a (docs/work-orders/W3-23-low-frame-rates.md, "The arrival at jitter 0"), written again from the order's
// words: at jitter 0, when 1000 / fps > 15 (fps limited as above), the model with jitter as its jitter goes to 0, in
// closed form. The message of tick p is in the listener's list from 15 (p + 1) ms (the server's relay tick); it leaves
// at the first look r with r - 15 (p + 1) > 0; at[p] = ceil(r / 15) - 2; floorTicks 0. Since the fix round (item 2)
// the looks are the frame clock's frames, (88200 k) / fps half samples against 1323 a tick. Here the looks are walked
// in order, one pointer for every tick, where the engine guesses the look and corrects it.
// Synthetic only: no recording, log or file of the game is read.

// mulberry32, as published (Tommy Ettinger's generator), written here again.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REFERENCE_START_TICK = -200;

export function referenceArrivals({ jitterMs, fps, seed, ticks }) {
  const at = new Int32Array(ticks);
  // The listener's frame rate as the voice channel limits it: 10 to 1000, 300 when not given.
  const F = Math.min(1000, Math.max(10, Number.isFinite(fps) ? fps : 300));
  if (!(jitterMs > 0)) {
    if (1000 / F > 15) {
      // W3-23a: the listener's first look after the server's relay tick, the looks timed as the frame clock times
      // its frames, (88200 k) / fps half samples against 1323 per tick (the fix round, item 2).
      for (let p = 0, k = 0; p < ticks; p++) {
        const enter = 1323 * (p + 1);
        while ((88200 * k) / F <= enter) k++;
        at[p] = Math.ceil((88200 * k) / F / 1323) - 2;
      }
    } else for (let p = 0; p < ticks; p++) at[p] = p;
    return { floorTicks: 0, at };
  }
  const s = (Number.isFinite(seed) ? seed : 0xC0FFEE) >>> 0;
  // Item 1: the lag is twice the jitter; j = min(jitter, lag / 2).
  const lag = 2 * jitterMs, j = Math.min(jitterMs, lag / 2);
  // Item 6, as the fix round of BC-4a states it (point 1): the least delay, in ticks. A crossing lets a packet go
  // only after the age `jitterMs`, at the next look, and it rides the next whole tick.
  const floorTicks = 2 * (Math.floor(jitterMs / 15) + 1);
  // Item 7: a random stream for each list.
  const draw1 = mulberry32((s ^ 0x4A495431) >>> 0), draw2 = mulberry32((s ^ 0x4A495432) >>> 0);
  // The lists start at tick -200 with a packet a tick (the plan review, point 5).
  const start = REFERENCE_START_TICK;
  // The first list (the server's socket): client packets { enter, tick }, one a tick; looked at at 15 k.
  // The second list (the listener's socket): the server's packets { enter, riders }, one for every server tick,
  // each carrying the client ticks that left the first list for its tick; looked at at k * 1000 / F.
  const list1 = [], list2 = [];
  let head1 = 0, head2 = 0;                      // the index of each list's head
  const riders = new Map();                      // server tick -> the client ticks that ride its packet
  let nextClient = start, nextServer = start;   // the next tick whose packet enters each list
  let k1 = start, k2 = Math.floor(15 * start * F / 1000) - 1;   // the next look of each list (no packet before)
  const arrived = new Map();                     // client tick -> its arrival tick
  let done = 0;
  // A look at time t at a list: the head is tested; while one leaves, the next is the head in the same look.
  const look = (list, headIndex, t, draw, release) => {
    let h = headIndex;
    while (h < list.length && list[h].enter <= t) {
      const age = t - list[h].enter;
      if (age < lag - j) break;                  // too young: no number drawn
      const u = draw();
      if (age >= lag + (2 * u - 1) * j) { release(list[h], t); h++; } else break;
    }
    return h;
  };
  while (done < ticks) {
    const t1 = 15 * k1, t2 = k2 * 1000 / F;
    if (t1 <= t2) {
      // Time t1 = 15 k1: the client packet of tick k1 enters the first list; the first list is looked at; the
      // server's packet of tick k1 enters the second list, carrying what left the first list in this look.
      list1.push({ enter: 15 * nextClient, tick: nextClient });
      nextClient++;
      head1 = look(list1, head1, t1, draw1, (packet, t) => {
        const q = Math.ceil(t / 15);
        if (!riders.has(q)) riders.set(q, []);
        riders.get(q).push(packet.tick);
      });
      list2.push({ enter: 15 * nextServer, riders: riders.get(nextServer) || [] });
      riders.delete(nextServer);
      nextServer++;
      k1++;
    } else {
      head2 = look(list2, head2, t2, draw2, (packet, t) => {
        for (const p of packet.riders) {
          arrived.set(p, Math.ceil(t / 15));
          if (p >= 0 && p < ticks) done++;
        }
      });
      k2++;
    }
  }
  for (let p = 0; p < ticks; p++) at[p] = arrived.get(p) - floorTicks;
  return { floorTicks, at };
}

// The share of packets that leave a list with nothing in front of them at each look past lagMs - j, by the closed
// form of the order's check 1: at its i-th look past lagMs - j a packet leaves with probability
// p_i (1 - p_1) ... (1 - p_(i-1)), p_i its age at that look less lagMs - j, over 2 j, limited to 0 and 1.
// lookTime(k) gives the looks; enter is the packet's entry. Returns [{ k, p }] for the looks with p > 0.
export function closedForm({ lagMs, jitterMs, lookTime, enter }) {
  const j = Math.min(jitterMs, lagMs / 2), out = [];
  // From a guess by the first two looks' spacing, the first look at which the packet is old enough.
  let k = Math.floor((enter + lagMs - j - lookTime(0)) / (lookTime(1) - lookTime(0)));
  while (lookTime(k) - enter >= lagMs - j) k--;
  while (lookTime(k) - enter < lagMs - j) k++;
  let stay = 1;
  for (; stay > 0; k++) {
    const age = lookTime(k) - enter;
    const p = Math.min(1, Math.max(0, (age - (lagMs - j)) / (2 * j)));
    out.push({ k, p: stay * p });
    stay *= 1 - p;
  }
  return out;
}
