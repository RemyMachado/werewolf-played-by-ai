import { describe, expect, it } from 'vitest';
import { buildPlayerView } from './view';
import { GameState } from '../types/game';

function state(): GameState {
  return {
    round: 2,
    players: [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 'w2', name: 'Wolf2', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Alice', role: 'villager', isAlive: false, isHuman: true },
      { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
    ],
    log: [{ type: 'speech', round: 1, playerId: 'v2', text: 'hi' }],
    seerKnowledge: { w1: 'werewolf', v2: 'villager' },
    wolfChat: [{ round: 2, wolfId: 'w1', text: 'kill Bob' }],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: {
      phase: 'night',
      pendingKillTarget: null,
      pendingInvestigateTarget: null,
      wolfVotes: { w1: 'v2' },
      pendingHeal: false,
      pendingPoison: null,
    },
  };
}

describe('buildPlayerView', () => {
  it('exposes alive players by name only, but reveals dead players\' roles', () => {
    const view = buildPlayerView(state(), 'v2');
    expect(view.alive.map((p) => p.name).sort()).toEqual(['Bob', 'Seer', 'Wolf', 'Wolf2']);
    // Alive refs never leak a role.
    for (const ref of view.alive) {
      expect(Object.keys(ref).sort()).toEqual(['id', 'name']);
    }
    // Dead players' roles are public (revealed on death).
    expect(view.dead).toEqual([{ id: 'v1', name: 'Alice', role: 'villager' }]);
  });

  it('exposes the starting role composition (counts only) to everyone', () => {
    // Roster: 2 werewolves, 1 seer, 2 villagers (one dead) → starting counts.
    const view = buildPlayerView(state(), 'v2');
    expect(view.composition).toEqual({ werewolf: 2, seer: 1, witch: 0, villager: 2 });
  });

  it('gives a villager NO private knowledge of anyone', () => {
    const view = buildPlayerView(state(), 'v2');
    expect(view.self.role).toBe('villager');
    expect(view.werewolfAllies).toEqual([]);
    expect(view.seerFindings).toEqual([]);
  });

  it('tells a werewolf about their allies but gives no seer findings', () => {
    const view = buildPlayerView(state(), 'w1');
    expect(view.werewolfAllies.map((a) => a.name)).toEqual(['Wolf2']);
    expect(view.seerFindings).toEqual([]);
  });

  it('gives the seer their findings but no werewolf allies', () => {
    const view = buildPlayerView(state(), 's1');
    expect(view.seerFindings).toContainEqual({ player: { id: 'w1', name: 'Wolf' }, role: 'werewolf' });
    expect(view.seerFindings).toContainEqual({ player: { id: 'v2', name: 'Bob' }, role: 'villager' });
    expect(view.werewolfAllies).toEqual([]);
  });

  it('never exposes the global seerKnowledge to non-seers', () => {
    const wolfView = buildPlayerView(state(), 'w1');
    const villagerView = buildPlayerView(state(), 'v2');
    expect(wolfView.seerFindings).toEqual([]);
    expect(villagerView.seerFindings).toEqual([]);
  });

  it('shows the pack chat and night votes to werewolves only', () => {
    const wolf = buildPlayerView(state(), 'w1');
    expect(wolf.wolfChat).toEqual([{ speaker: 'Wolf', text: 'kill Bob', round: 2 }]);
    expect(wolf.wolfVotes).toEqual([{ voter: 'Wolf', target: 'Bob' }]);

    for (const id of ['s1', 'v2']) {
      const view = buildPlayerView(state(), id);
      expect(view.wolfChat).toEqual([]);
      expect(view.wolfVotes).toEqual([]);
    }
  });
});
