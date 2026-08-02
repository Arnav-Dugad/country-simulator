/**
 * Deterministic RNG. The seed lives in `GameState.rngSeed` so a save resumed
 * on another machine produces the same sequence of events.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Advances the seed and returns the next float in [0, 1). */
export function nextRandom(state: { rngSeed: number }): number {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  const rng = mulberry32(state.rngSeed);
  return rng();
}

export function randRange(state: { rngSeed: number }, min: number, max: number): number {
  return min + nextRandom(state) * (max - min);
}

export function randInt(state: { rngSeed: number }, min: number, max: number): number {
  return Math.floor(randRange(state, min, max + 1));
}

export function pick<T>(state: { rngSeed: number }, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(nextRandom(state) * arr.length))];
}

/** Weighted pick. Returns null when every weight is zero. */
export function weightedPick<T>(
  state: { rngSeed: number },
  items: readonly T[],
  weightOf: (item: T) => number,
): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let roll = nextRandom(state) * total;
  for (const it of items) {
    roll -= Math.max(0, weightOf(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1] ?? null;
}

/** Gaussian-ish noise in roughly [-1, 1], centred on 0. */
export function noise(state: { rngSeed: number }): number {
  return (nextRandom(state) + nextRandom(state) + nextRandom(state)) / 1.5 - 1;
}
