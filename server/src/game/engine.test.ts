import { describe, expect, it } from 'vitest';
import {
  checkWinCondition,
  recordSpeech,
  recordVote,
  recordWolfKillVote,
  recordWolfMessage,
  resolveNight,
  resolveWolfKill,
  setNightInvestigateTarget,
  setNightKillTarget,
  setWitchHeal,
  setWitchPoison,
  startGame,
} from './engine';
import { GameState, Player } from '../types/game';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Builds a deterministic in-progress game state (night phase, round 1).
// 5 players: 1 werewolf (w1), 1 seer (s1), 3 villagers (v1 human, v2, v3).
function nightState(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    players: [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
    ],
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: {
      phase: 'night',
      pendingKillTarget: null,
      pendingInvestigateTarget: null,
      wolfVotes: {},
      pendingHeal: false,
      pendingPoison: null,
    },
    ...overrides,
  };
}

// Advances a night state through resolveNight, recording optional targets first.
function resolvedNight(
  kill: { actor: string; target: string } | null,
  investigate: { actor: string; target: string } | null,
  base = nightState(),
): GameState {
  let state = base;
  if (kill) state = setNightKillTarget(state, kill.actor, kill.target);
  if (investigate) state = setNightInvestigateTarget(state, investigate.actor, investigate.target);
  return resolveNight(state);
}

// Puts a state into day-debate and runs every alive player through recordSpeech.
function voteState(base = nightState()): GameState {
  let s: GameState = { ...base, phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
  for (const p of s.players.filter((p) => p.isAlive)) {
    s = recordSpeech(s, p.id, `${p.name} speaks.`);
  }
  return s;
}

// Casts a vote from every alive player toward a single target.
function allVoteFor(state: GameState, targetId: string): GameState {
  let s = state;
  for (const p of s.players.filter((p) => p.isAlive && p.id !== targetId)) {
    s = recordVote(s, p.id, targetId);
  }
  const target = s.players.find((p) => p.id === targetId);
  if (target?.isAlive) {
    const fallback = s.players.find((p) => p.isAlive && p.id !== targetId)!;
    s = recordVote(s, targetId, fallback.id);
  }
  return s;
}

// ---------------------------------------------------------------------------
// startGame
// ---------------------------------------------------------------------------

describe('startGame', () => {
  it('transitions from lobby to night, sets round to 1', () => {
    const lobby: GameState = { ...nightState(), round: 0, phaseData: { phase: 'lobby' } };
    const state = startGame(lobby);
    expect(state.phaseData.phase).toBe('night');
    expect(state.round).toBe(1);
  });

  it('throws if called outside lobby', () => {
    expect(() => startGame(nightState())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Night: setNightKillTarget
// ---------------------------------------------------------------------------

describe('setNightKillTarget', () => {
  it('records the kill target', () => {
    const state = setNightKillTarget(nightState(), 'w1', 'v1');
    expect(state.phaseData).toMatchObject({ pendingKillTarget: 'v1' });
  });

  it('throws if not night phase', () => {
    const state: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    expect(() => setNightKillTarget(state, 'w1', 'v1')).toThrow();
  });

  it('throws if the actor is not a werewolf', () => {
    expect(() => setNightKillTarget(nightState(), 'v1', 'v2')).toThrow(/not a werewolf/);
  });

  it('throws if the actor is dead', () => {
    const state = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: false, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
        { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
        { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
      ],
    });
    expect(() => setNightKillTarget(state, 'w1', 'v1')).toThrow(/dead/);
  });

  it('throws if the target is dead', () => {
    const state = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: false, isHuman: true },
        { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
        { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
      ],
    });
    expect(() => setNightKillTarget(state, 'w1', 'v1')).toThrow(/already dead/);
  });

  it('throws if the target is another werewolf', () => {
    const twoWolves = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 'w2', name: 'Wolf2', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
        { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
      ],
    });
    expect(() => setNightKillTarget(twoWolves, 'w1', 'w2')).toThrow(/another werewolf/);
  });
});

// ---------------------------------------------------------------------------
// Night: setNightInvestigateTarget
// ---------------------------------------------------------------------------

describe('setNightInvestigateTarget', () => {
  it('records the investigate target', () => {
    const state = setNightInvestigateTarget(nightState(), 's1', 'w1');
    expect(state.phaseData).toMatchObject({ pendingInvestigateTarget: 'w1' });
  });

  it('records the learned role immediately (no public log entry), before resolveNight', () => {
    const state = setNightInvestigateTarget(nightState(), 's1', 'w1');
    expect(state.seerKnowledge['w1']).toBe('werewolf');
    expect(state.log).toHaveLength(0); // investigation is private — nothing public
  });

  it('throws if not night phase', () => {
    const state: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    expect(() => setNightInvestigateTarget(state, 's1', 'w1')).toThrow();
  });

  it('throws if the actor is not the seer', () => {
    expect(() => setNightInvestigateTarget(nightState(), 'v1', 'w1')).toThrow(/not the seer/);
  });

  it('throws if the seer investigates themselves', () => {
    expect(() => setNightInvestigateTarget(nightState(), 's1', 's1')).toThrow(/themselves/);
  });
});

// ---------------------------------------------------------------------------
// Wolf night discussion + voting
// ---------------------------------------------------------------------------

describe('recordWolfMessage', () => {
  it('appends to the private wolf chat with the current round', () => {
    const state = recordWolfMessage(nightState(), 'w1', 'kill the seer');
    expect(state.wolfChat).toEqual([{ round: 1, wolfId: 'w1', text: 'kill the seer' }]);
  });

  it('throws if the speaker is not a living werewolf', () => {
    expect(() => recordWolfMessage(nightState(), 'v1', 'hi')).toThrow(/not a werewolf/);
  });
});

describe('recordWolfKillVote', () => {
  it('records a wolf kill vote', () => {
    const state = recordWolfKillVote(nightState(), 'w1', 'v1');
    expect(state.phaseData).toMatchObject({ wolfVotes: { w1: 'v1' } });
  });

  it('rejects targeting a werewolf', () => {
    const twoWolves = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 'w2', name: 'Wolf2', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
        { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
      ],
    });
    expect(() => recordWolfKillVote(twoWolves, 'w1', 'w2')).toThrow(/another werewolf/);
  });
});

describe('resolveWolfKill', () => {
  const players = nightState().players;

  it('returns the majority target', () => {
    expect(resolveWolfKill({ w1: 'v1', w2: 'v1', w3: 'v2' }, players)).toBe('v1');
  });

  it('gives a human wolf the final say regardless of the majority', () => {
    expect(resolveWolfKill({ w1: 'v1', w2: 'v1', human: 'v2' }, players, 'human')).toBe('v2');
  });

  it('breaks a tie by seating order', () => {
    // v1 and v2 tie; v1 comes first in the roster.
    expect(resolveWolfKill({ w1: 'v2', w2: 'v1' }, players)).toBe('v1');
  });
});

// ---------------------------------------------------------------------------
// resolveNight
// ---------------------------------------------------------------------------

describe('resolveNight', () => {
  it('kills the target and logs an elimination', () => {
    const state = resolvedNight({ actor: 'w1', target: 'v1' }, null);
    expect(state.players.find((p) => p.id === 'v1')!.isAlive).toBe(false);
    expect(state.log).toContainEqual(
      expect.objectContaining({ type: 'elimination', playerId: 'v1', cause: 'night-kill' }),
    );
  });

  it('records the seer investigation privately, with no public log entry', () => {
    const state = resolvedNight(null, { actor: 's1', target: 'w1' });
    expect(state.seerKnowledge['w1']).toBe('werewolf');
    // The investigation must not leak into the public log: the only entry added
    // by resolveNight here is the phase change to day-debate.
    expect(state.log.filter((e) => e.type !== 'phase-change')).toHaveLength(0);
  });

  it('transitions to day-debate when the game continues', () => {
    const state = resolvedNight({ actor: 'w1', target: 'v1' }, { actor: 's1', target: 'w1' });
    expect(state.phaseData.phase).toBe('day-debate');
  });

  it('transitions to game-over (werewolves win) when a kill reaches parity', () => {
    // 3 players: killing the seer leaves 1 wolf vs 1 villager → wolves win.
    const slim = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      ],
    });
    const state = resolvedNight({ actor: 'w1', target: 's1' }, null, slim);
    expect(state.phaseData.phase).toBe('game-over');
    if (state.phaseData.phase === 'game-over') expect(state.phaseData.winner).toBe('werewolves');
  });

  it('proceeds with no kill when no target was set', () => {
    const state = resolvedNight(null, null);
    expect(state.players.every((p) => p.isAlive)).toBe(true);
    expect(state.phaseData.phase).toBe('day-debate');
  });

  it('throws if not night phase', () => {
    const state: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    expect(() => resolveNight(state)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Night: the Witch (setWitchHeal / setWitchPoison / resolveNight interplay)
// ---------------------------------------------------------------------------

// A 6-player night with a living witch (k1): 1 wolf, 1 seer, 1 witch, 3 villagers.
function witchNight(overrides: Partial<GameState> = {}): GameState {
  return nightState({
    players: [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'k1', name: 'Wanda', role: 'witch', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
    ],
    ...overrides,
  });
}

describe('setWitchHeal', () => {
  it('marks the wolves\' victim to be healed', () => {
    const state = setWitchHeal(setNightKillTarget(witchNight(), 'w1', 'v1'), 'k1');
    expect(state.phaseData).toMatchObject({ pendingHeal: true });
  });

  it('throws if there is no victim to heal', () => {
    expect(() => setWitchHeal(witchNight(), 'k1')).toThrow(/no victim/);
  });

  it('throws if the healing potion was already used', () => {
    const used = setNightKillTarget(witchNight({ witchHealUsed: true }), 'w1', 'v1');
    expect(() => setWitchHeal(used, 'k1')).toThrow(/already used/);
  });

  it('throws if the actor is not the witch', () => {
    const state = setNightKillTarget(witchNight(), 'w1', 'v1');
    expect(() => setWitchHeal(state, 'v2')).toThrow(/not the witch/);
  });
});

describe('setWitchPoison', () => {
  it('records the poison target', () => {
    const state = setWitchPoison(witchNight(), 'k1', 'v2');
    expect(state.phaseData).toMatchObject({ pendingPoison: 'v2' });
  });

  it('throws if the poison potion was already used', () => {
    expect(() => setWitchPoison(witchNight({ witchPoisonUsed: true }), 'k1', 'v2')).toThrow(/already used/);
  });

  it('throws if the target is already dead', () => {
    const state = witchNight({
      players: witchNight().players.map((p) => (p.id === 'v2' ? { ...p, isAlive: false } : p)),
    });
    expect(() => setWitchPoison(state, 'k1', 'v2')).toThrow(/already dead/);
  });

  it('throws if the actor is not the witch', () => {
    expect(() => setWitchPoison(witchNight(), 'v2', 'v3')).toThrow(/not the witch/);
  });
});

describe('resolveNight with the witch', () => {
  it('saves the wolves\' victim when the witch heals, leaving no death', () => {
    let state = setNightKillTarget(witchNight(), 'w1', 'v1');
    state = setWitchHeal(state, 'k1');
    const resolved = resolveNight(state);
    expect(resolved.players.find((p) => p.id === 'v1')!.isAlive).toBe(true);
    expect(resolved.witchHealUsed).toBe(true);
    expect(resolved.log.some((e) => e.type === 'elimination')).toBe(false);
    // A night with no death is announced publicly, so it is not a confusing silence.
    expect(resolved.log).toContainEqual(
      expect.objectContaining({ type: 'no-elimination', reason: 'no-night-death' }),
    );
  });

  it('kills both the wolves\' victim and the witch\'s poison target (two deaths)', () => {
    let state = setNightKillTarget(witchNight(), 'w1', 'v1');
    state = setWitchPoison(state, 'k1', 'v2');
    const resolved = resolveNight(state);
    expect(resolved.players.find((p) => p.id === 'v1')!.isAlive).toBe(false);
    expect(resolved.players.find((p) => p.id === 'v2')!.isAlive).toBe(false);
    expect(resolved.log.filter((e) => e.type === 'elimination')).toHaveLength(2);
    expect(resolved.log).toContainEqual(expect.objectContaining({ type: 'elimination', playerId: 'v2', cause: 'poison' }));
    expect(resolved.witchPoisonUsed).toBe(true);
  });

  it('counts a player both attacked and poisoned as a single death', () => {
    let state = setNightKillTarget(witchNight(), 'w1', 'v1');
    state = setWitchPoison(state, 'k1', 'v1');
    const resolved = resolveNight(state);
    expect(resolved.log.filter((e) => e.type === 'elimination')).toHaveLength(1);
  });

  it('lets the witch poison heal-and-poison in the same night', () => {
    let state = setNightKillTarget(witchNight(), 'w1', 'v1');
    state = setWitchHeal(state, 'k1');
    state = setWitchPoison(state, 'k1', 'v2');
    const resolved = resolveNight(state);
    expect(resolved.players.find((p) => p.id === 'v1')!.isAlive).toBe(true); // saved
    expect(resolved.players.find((p) => p.id === 'v2')!.isAlive).toBe(false); // poisoned
    expect(resolved.witchHealUsed).toBe(true);
    expect(resolved.witchPoisonUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recordSpeech
// ---------------------------------------------------------------------------

describe('recordSpeech', () => {
  it('adds speech to the log and tracks speechesDone', () => {
    const base: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    const state = recordSpeech(base, 'v1', 'I think it is Wolf.');
    expect(state.log).toContainEqual(expect.objectContaining({ type: 'speech', playerId: 'v1' }));
    expect(state.phaseData).toMatchObject({ speechesDone: ['v1'] });
  });

  it('auto-transitions to day-vote after the last player speaks', () => {
    expect(voteState().phaseData.phase).toBe('day-vote');
  });

  it('throws if not day-debate phase', () => {
    expect(() => recordSpeech(nightState(), 'v1', 'hello')).toThrow();
  });

  it('throws if the player is dead', () => {
    const base: GameState = {
      ...nightState({
        players: [
          { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
          { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
          { id: 'v1', name: 'Alice', role: 'villager', isAlive: false, isHuman: true },
          { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
          { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
        ],
      }),
      phaseData: { phase: 'day-debate', speechesDone: [], round: 1 },
    };
    expect(() => recordSpeech(base, 'v1', 'hello')).toThrow();
  });

  it('throws if the player already spoke this round', () => {
    const base: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: ['v1'], round: 1 } };
    expect(() => recordSpeech(base, 'v1', 'again')).toThrow();
  });

  it('runs a second debate round before voting when totalRounds is 2', () => {
    const alive = (s: GameState) => s.players.filter((p) => p.isAlive);
    let s: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    // Round 1: everyone speaks → should NOT go to vote yet; it opens round 2.
    for (const p of alive(s)) s = recordSpeech(s, p.id, `${p.name} (r1)`, 2);
    expect(s.phaseData.phase).toBe('day-debate');
    expect(s.phaseData).toMatchObject({ round: 2, speechesDone: [] });
    // Round 2: everyone speaks again → now it transitions to the vote.
    for (const p of alive(s)) s = recordSpeech(s, p.id, `${p.name} (r2)`, 2);
    expect(s.phaseData.phase).toBe('day-vote');
  });

  it('treats an empty speech as a silent pass: marks the speaker done but logs nothing', () => {
    const base: GameState = { ...nightState(), phaseData: { phase: 'day-debate', speechesDone: [], round: 1 } };
    const state = recordSpeech(base, 'v1', '   ');
    expect(state.phaseData).toMatchObject({ speechesDone: ['v1'] }); // counts as their turn
    expect(state.log.some((e) => e.type === 'speech')).toBe(false); // but no public line
  });
});

// ---------------------------------------------------------------------------
// recordVote
// ---------------------------------------------------------------------------

describe('recordVote', () => {
  it('eliminates the player with the most votes', () => {
    const state = allVoteFor(voteState(), 'w1');
    expect(state.players.find((p) => p.id === 'w1')!.isAlive).toBe(false);
    expect(state.log).toContainEqual(
      expect.objectContaining({ type: 'elimination', playerId: 'w1', cause: 'vote' }),
    );
  });

  it('transitions to game-over (villagers win) when the last werewolf is voted out', () => {
    const state = allVoteFor(voteState(), 'w1');
    expect(state.phaseData.phase).toBe('game-over');
    if (state.phaseData.phase === 'game-over') expect(state.phaseData.winner).toBe('villagers');
  });

  it('transitions to the next night round when the game continues', () => {
    const state = allVoteFor(voteState(), 'v1');
    expect(state.phaseData.phase).toBe('night');
    expect(state.round).toBe(2);
  });

  // 4-player roster (w1, s1, v1, v2) used for tie scenarios.
  const fourPlayers: Player[] = [
    { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
    { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
    { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
    { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
  ];

  // Drives a 2-2 first-ballot tie between v1 and w1, returning the resulting
  // (runoff) state with nobody eliminated yet.
  function reachRunoff(): GameState {
    let state = voteState(nightState({ players: fourPlayers }));
    state = recordVote(state, 'w1', 'v1');
    state = recordVote(state, 's1', 'v1');
    state = recordVote(state, 'v1', 'w1');
    state = recordVote(state, 'v2', 'w1');
    return state;
  }

  it('opens a runoff between the tied players on a first-ballot tie', () => {
    const state = reachRunoff();
    expect(state.phaseData.phase).toBe('day-vote');
    if (state.phaseData.phase === 'day-vote') {
      expect(state.phaseData.isRunoff).toBe(true);
      expect([...state.phaseData.candidates].sort()).toEqual(['v1', 'w1']);
      expect(state.phaseData.votes).toEqual({});
    }
    expect(state.players.every((p) => p.isAlive)).toBe(true); // nobody dies yet
    expect(state.log).toContainEqual(expect.objectContaining({ type: 'runoff' }));
  });

  it('eliminates the runoff winner when the second ballot is decisive', () => {
    let state = reachRunoff();
    // Runoff (candidates v1/w1): v1 takes 3 votes, w1 takes 1.
    state = recordVote(state, 'w1', 'v1');
    state = recordVote(state, 's1', 'v1');
    state = recordVote(state, 'v2', 'v1');
    state = recordVote(state, 'v1', 'w1');
    expect(state.players.find((p) => p.id === 'v1')!.isAlive).toBe(false);
    expect(state.log).toContainEqual(
      expect.objectContaining({ type: 'elimination', playerId: 'v1', cause: 'vote' }),
    );
  });

  it('eliminates nobody when the runoff is also tied, then moves to night', () => {
    let state = reachRunoff();
    // Runoff ties 2-2 again.
    state = recordVote(state, 'w1', 'v1');
    state = recordVote(state, 's1', 'v1');
    state = recordVote(state, 'v1', 'w1');
    state = recordVote(state, 'v2', 'w1');
    expect(state.players.every((p) => p.isAlive)).toBe(true);
    expect(state.phaseData.phase).toBe('night');
    expect(state.round).toBe(2);
    expect(state.log.filter((e) => e.type === 'elimination')).toHaveLength(0);
  });

  it('logs a no-elimination entry (runoff-tie) when the runoff also ties', () => {
    let state = reachRunoff();
    state = recordVote(state, 'w1', 'v1');
    state = recordVote(state, 's1', 'v1');
    state = recordVote(state, 'v1', 'w1');
    state = recordVote(state, 'v2', 'w1');
    expect(state.log).toContainEqual(
      expect.objectContaining({ type: 'no-elimination', reason: 'runoff-tie', round: 1 }),
    );
  });

  it('eliminates nobody and logs a no-elimination entry (all-abstained) when everyone abstains', () => {
    let state = voteState(nightState({ players: fourPlayers }));
    for (const id of ['w1', 's1', 'v1', 'v2']) state = recordVote(state, id, null);
    expect(state.players.every((p) => p.isAlive)).toBe(true);
    expect(state.phaseData.phase).toBe('night');
    expect(state.log).toContainEqual(
      expect.objectContaining({ type: 'no-elimination', reason: 'all-abstained', round: 1 }),
    );
  });

  it('rejects a runoff vote for someone who is not a tied candidate', () => {
    const state = reachRunoff(); // candidates are v1 and w1
    expect(() => recordVote(state, 's1', 'v2')).toThrow(/not a candidate/);
  });

  it('throws when a player votes for themselves', () => {
    expect(() => recordVote(voteState(), 'v1', 'v1')).toThrow();
  });

  it('throws when voting for a dead player', () => {
    const deadVillager = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: false, isHuman: true },
        { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
        { id: 'v3', name: 'Charlie', role: 'villager', isAlive: true, isHuman: false },
      ],
    });
    expect(() => recordVote(voteState(deadVillager), 'w1', 'v1')).toThrow();
  });

  it('throws if not day-vote phase', () => {
    expect(() => recordVote(nightState(), 'v1', 'w1')).toThrow();
  });

  it('records an abstention (null target) without resolving early', () => {
    const state = recordVote(voteState(), 'v1', null);
    expect(state.phaseData.phase).toBe('day-vote'); // others still to vote
    if (state.phaseData.phase === 'day-vote') expect(state.phaseData.votes).toMatchObject({ v1: null });
  });

  it('eliminates nobody when everyone abstains', () => {
    let state = voteState();
    for (const id of ['w1', 's1', 'v1', 'v2', 'v3']) state = recordVote(state, id, null);
    expect(state.players.every((p) => p.isAlive)).toBe(true);
    expect(state.phaseData.phase).toBe('night');
    expect(state.log.filter((e) => e.type === 'elimination')).toHaveLength(0);
  });

  it('ignores abstentions when tallying — a single real vote decides', () => {
    let state = voteState();
    state = recordVote(state, 'w1', 'v1'); // one real vote
    for (const id of ['s1', 'v1', 'v2', 'v3']) state = recordVote(state, id, null);
    expect(state.players.find((p) => p.id === 'v1')!.isAlive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkWinCondition
// ---------------------------------------------------------------------------

describe('checkWinCondition', () => {
  it('returns villagers when no werewolves are alive', () => {
    const state = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: false, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      ],
    });
    expect(checkWinCondition(state)).toBe('villagers');
  });

  it('returns werewolves when they equal the villager-side count', () => {
    const state = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      ],
    });
    expect(checkWinCondition(state)).toBe('werewolves');
  });

  it('returns werewolves when they outnumber the villager-side', () => {
    const state = nightState({
      players: [
        { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 'w2', name: 'Wolf2', role: 'werewolf', isAlive: true, isHuman: false },
        { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: true },
      ],
    });
    expect(checkWinCondition(state)).toBe('werewolves');
  });

  it('returns null when the game is undecided', () => {
    expect(checkWinCondition(nightState())).toBeNull();
  });
});
