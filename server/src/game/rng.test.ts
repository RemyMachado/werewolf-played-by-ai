import { describe, expect, it } from 'vitest';
import { seededRng, shuffle } from './rng';

describe('seededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRng(99);
    const b = seededRng(99);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRng(1);
    const b = seededRng(2);
    expect(a()).not.toBe(b());
  });

  it('returns values in [0, 1)', () => {
    const rng = seededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a new array without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seededRng(1));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out).not.toBe(input);
  });

  it('preserves all elements (is a permutation)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, seededRng(3));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('is deterministic for a given seed', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRng(7));
    const b = shuffle([1, 2, 3, 4, 5], seededRng(7));
    expect(a).toEqual(b);
  });

  it('distributes roughly uniformly (sanity check on first position)', () => {
    // A correct Fisher-Yates puts each element in position 0 ~equally often.
    // A biased shuffle (e.g. sort with random comparator) would skew this.
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const rng = seededRng(2024);
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const out = shuffle([1, 2, 3, 4, 5], rng);
      counts[out[0]]++;
    }
    // Each element should land first ~2000 times; allow a generous tolerance.
    for (const id of [1, 2, 3, 4, 5]) {
      expect(counts[id]).toBeGreaterThan(1600);
      expect(counts[id]).toBeLessThan(2400);
    }
  });
});
