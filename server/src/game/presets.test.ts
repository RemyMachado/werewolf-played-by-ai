import { describe, expect, it } from 'vitest';
import { PRESETS, buildPlayers } from './presets';
import { createGame } from './state';

describe('PRESETS', () => {
  it('every preset produces a valid, non-pre-decided game', () => {
    for (const p of PRESETS) {
      expect(() =>
        createGame({ players: buildPlayers(p.players, null), werewolfCount: p.werewolves, includeWitch: p.witch }),
      ).not.toThrow();
    }
  });

  it('keeps villagers strictly outnumbering werewolves', () => {
    for (const p of PRESETS) {
      expect(p.players).toBeGreaterThan(2 * p.werewolves);
    }
  });

  it('includes the witch only in the official 8+ player presets', () => {
    for (const p of PRESETS) {
      expect(p.witch).toBe(p.players >= 8);
    }
  });

  it('assigns the witch role when a witch preset is built', () => {
    const witchPreset = PRESETS.find((p) => p.witch)!;
    const state = createGame({
      players: buildPlayers(witchPreset.players, null),
      werewolfCount: witchPreset.werewolves,
      includeWitch: witchPreset.witch,
    });
    expect(state.players.filter((p) => p.role === 'witch')).toHaveLength(1);
  });
});

describe('buildPlayers', () => {
  it('builds the requested number of all-NPC players with unique names', () => {
    const players = buildPlayers(8, null);
    expect(players).toHaveLength(8);
    expect(new Set(players.map((p) => p.name)).size).toBe(8);
    expect(players.every((p) => !p.isHuman)).toBe(true);
  });

  it('seats the human first and avoids a name clash with the pool', () => {
    const players = buildPlayers(5, 'Alice'); // "Alice" also exists in the pool
    expect(players[0]).toMatchObject({ name: 'Alice', isHuman: true });
    expect(players.filter((p) => p.isHuman)).toHaveLength(1);
    expect(new Set(players.map((p) => p.name.toLowerCase())).size).toBe(5);
  });

  it('throws if more players are requested than names available', () => {
    expect(() => buildPlayers(99, null)).toThrow(/Not enough names/);
  });
});
