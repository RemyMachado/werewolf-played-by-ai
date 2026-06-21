// A random source returning a float in [0, 1) — same contract as Math.random.
// Injected everywhere randomness is needed so game logic stays deterministic in tests.
export type Rng = () => number;

// Fisher-Yates shuffle. Uniform given a uniform rng, and (unlike sort-with-random-
// comparator) actually correct. Returns a new array; does not mutate the input.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Deterministic, seedable PRNG (mulberry32). Used by tests to make randomised
// game logic reproducible. Not for any security-sensitive purpose.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
