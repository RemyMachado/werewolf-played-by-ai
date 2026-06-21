import { describe, expect, it } from 'vitest';
import { matchOption } from './resolve';
import { Player } from '../types/game';

const options: Player[] = [
  { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
  { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: false },
];

describe('matchOption', () => {
  it('matches by exact name', () => {
    expect(matchOption('Alice', options)).toBe('v1');
  });

  it('matches case-insensitively and trims whitespace', () => {
    expect(matchOption('  alice ', options)).toBe('v1');
  });

  it('matches by id as a fallback', () => {
    expect(matchOption('w1', options)).toBe('w1');
  });

  it('returns null for an unknown name', () => {
    expect(matchOption('Nobody', options)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchOption('', options)).toBeNull();
  });
});
