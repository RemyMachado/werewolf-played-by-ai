import { describe, expect, it } from 'vitest';
import { createGame } from './state';
import { seededRng } from './rng';
import { GameConfig } from '../types/game';

function config(count: number, werewolfCount: number, includeWitch = false): GameConfig {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      isHuman: i === 0,
    })),
    werewolfCount,
    includeWitch,
  };
}

describe('createGame', () => {
  it('assigns exactly the requested roles (N werewolves, 1 seer, rest villagers)', () => {
    const state = createGame(config(5, 1));
    expect(state.players.filter((p) => p.role === 'werewolf')).toHaveLength(1);
    expect(state.players.filter((p) => p.role === 'seer')).toHaveLength(1);
    expect(state.players.filter((p) => p.role === 'villager')).toHaveLength(3);
  });

  it('assigns exactly one witch when includeWitch is set', () => {
    const state = createGame(config(8, 2, true));
    expect(state.players.filter((p) => p.role === 'witch')).toHaveLength(1);
    expect(state.players.filter((p) => p.role === 'werewolf')).toHaveLength(2);
    expect(state.players.filter((p) => p.role === 'seer')).toHaveLength(1);
    expect(state.players.filter((p) => p.role === 'villager')).toHaveLength(4);
  });

  it('assigns no witch when includeWitch is unset', () => {
    const state = createGame(config(8, 2));
    expect(state.players.filter((p) => p.role === 'witch')).toHaveLength(0);
  });

  it('starts with both witch potions unused', () => {
    const state = createGame(config(8, 2, true));
    expect(state.witchHealUsed).toBe(false);
    expect(state.witchPoisonUsed).toBe(false);
  });

  it('supports more than one werewolf', () => {
    const state = createGame(config(7, 2));
    expect(state.players.filter((p) => p.role === 'werewolf')).toHaveLength(2);
    expect(state.players.filter((p) => p.role === 'seer')).toHaveLength(1);
    expect(state.players.filter((p) => p.role === 'villager')).toHaveLength(4);
  });

  it('preserves all players and their identities', () => {
    const state = createGame(config(5, 1));
    expect(state.players.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(state.players.every((p) => p.isAlive)).toBe(true);
  });

  it('starts in lobby phase at round 0 with an empty log', () => {
    const state = createGame(config(5, 1));
    expect(state.phaseData.phase).toBe('lobby');
    expect(state.round).toBe(0);
    expect(state.log).toHaveLength(0);
    expect(state.seerKnowledge).toEqual({});
  });

  it('is deterministic for a given seed', () => {
    const a = createGame(config(7, 2), seededRng(123));
    const b = createGame(config(7, 2), seededRng(123));
    expect(a.players).toEqual(b.players);
  });

  it('actually shuffles role assignment (not always positional)', () => {
    // With a fixed seed the werewolf should not trivially always be p1; assert the
    // assignment for this seed differs from the unshuffled input order.
    const state = createGame(config(7, 2), seededRng(7));
    const inputOrder = state.players.map((p) => p.id);
    expect(inputOrder).not.toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  describe('validation', () => {
    it('rejects fewer than 3 players', () => {
      expect(() => createGame(config(2, 1))).toThrow(/at least 3 players/);
    });

    it('rejects zero werewolves', () => {
      expect(() => createGame(config(5, 0))).toThrow(/at least 1 werewolf/);
    });

    it('rejects a config where werewolves are not outnumbered', () => {
      // 4 players, 2 werewolves → villager side (2) does not strictly outnumber wolves.
      expect(() => createGame(config(4, 2))).toThrow(/strictly outnumber/);
    });

    it('rejects duplicate player ids', () => {
      const dup: GameConfig = {
        players: [
          { id: 'x', name: 'A', isHuman: true },
          { id: 'x', name: 'B', isHuman: false },
          { id: 'y', name: 'C', isHuman: false },
        ],
        werewolfCount: 1,
      };
      expect(() => createGame(dup)).toThrow(/id/);
    });

    it('rejects duplicate player names (NPCs resolve targets by name)', () => {
      const dup: GameConfig = {
        players: [
          { id: 'a', name: 'Sam', isHuman: true },
          { id: 'b', name: 'sam', isHuman: false },
          { id: 'c', name: 'Cy', isHuman: false },
        ],
        werewolfCount: 1,
      };
      expect(() => createGame(dup)).toThrow(/name/);
    });
  });
});
