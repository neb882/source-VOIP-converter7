// The comparison of tests/gain-exact.mjs, in a file of its own so that the
// check `gain` loads no module that can start a process (tests/gain-exact.mjs
// runs itself as a child for --synthetic). The engine is loaded as
// tests/gain-exact.mjs loads it (TF2_DIR, else the repository).
import { loadEngine, sourceRoot } from '../lib/engine.cjs';

const PACKET = 512;

// On two files' samples (Int16Arrays of one length): the engine's
// receiverAutoGain at voice_maxgain 10 run on gain1, rounded back to 16
// bits, against gain10. Counts the samples that differ before the last
// `packet` samples and in them, and the samples before them that the gain
// changed (where it is not 1).
export function compareGain(gain1, gain10, packet = PACKET) {
  if (gain1.length !== gain10.length) throw new Error(`the files differ in length (${gain1.length} and ${gain10.length} samples)`);
  const n = gain1.length, body = n - packet;
  const A = loadEngine({ root: sourceRoot() }).audio;
  const x = Float32Array.from(gain1, v => v / 32768);
  const y = A.receiverAutoGain(x, { maxGain: 10, avgGain: 0.5, scale: 1 });
  let before = 0, last = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.round(y[i] * 32768);
    if (i < body && v !== gain1[i]) changed++;
    if (v === gain10[i]) continue;
    if (i < body) before++; else last++;
  }
  return { before, last, body, packet, changed };
}
