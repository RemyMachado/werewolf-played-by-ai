import { describe, expect, it } from 'vitest';
import { investigationTargets, nightKillTargets, poisonTargets, voteTargets } from './targets';
import { GameState } from '../types/game';

function base(phase: GameState['phaseData']): GameState {
  return {
    round: 1,
    players: [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      { id: 'v2', name: 'Bob', role: 'villager', isAlive: false, isHuman: false },
    ],
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: phase,
  };
}

const night = base({
  phase: 'night',
  pendingKillTarget: null,
  pendingInvestigateTarget: null,
  wolfVotes: {},
  pendingHeal: false,
  pendingPoison: null,
});

describe('nightKillTargets', () => {
  it('returns living non-werewolves', () => {
    expect(nightKillTargets(night).map((p) => p.id).sort()).toEqual(['s1', 'v1']);
  });
});

describe('investigationTargets', () => {
  it('returns living players except the seer', () => {
    expect(investigationTargets(night, 's1').map((p) => p.id).sort()).toEqual(['v1', 'w1']);
  });
});

describe('poisonTargets', () => {
  it('returns living players except the witch (dead players excluded)', () => {
    // s1 stands in as the witch seat here; v2 is dead and must be excluded.
    expect(poisonTargets(night, 's1').map((p) => p.id).sort()).toEqual(['v1', 'w1']);
  });
});

describe('voteTargets', () => {
  it('returns living players except the voter (first ballot)', () => {
    const vote = base({ phase: 'day-vote', votes: {}, candidates: ['w1', 's1', 'v1'], isRunoff: false });
    expect(voteTargets(vote, 'v1').map((p) => p.id).sort()).toEqual(['s1', 'w1']);
  });

  it('restricts to the tied candidates during a runoff', () => {
    const runoff = base({ phase: 'day-vote', votes: {}, candidates: ['w1', 's1'], isRunoff: true });
    expect(voteTargets(runoff, 'v1').map((p) => p.id).sort()).toEqual(['s1', 'w1']);
    // A candidate cannot vote for themselves.
    expect(voteTargets(runoff, 'w1').map((p) => p.id)).toEqual(['s1']);
  });
});
