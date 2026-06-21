import { describe, expect, it, vi } from 'vitest';
import { runGame } from './orchestrator';
import { PlayerController } from './controller';
import { GameState, Player } from '../types/game';

// ---------------------------------------------------------------------------
// Fixtures: deterministic 5-player roster with known roles.
// ---------------------------------------------------------------------------

function roster(): Player[] {
  return [
    { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
    { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
    { id: 'v1', name: 'Al', role: 'villager', isAlive: true, isHuman: false },
    { id: 'v2', name: 'Bo', role: 'villager', isAlive: true, isHuman: false },
    { id: 'v3', name: 'Cy', role: 'villager', isAlive: true, isHuman: false },
  ];
}

function lobby(players = roster()): GameState {
  return {
    round: 0,
    players,
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: { phase: 'lobby' },
  };
}

const firstAliveNonWolf = (s: GameState): string => s.players.find((p) => p.isAlive && p.role !== 'werewolf')!.id;
const firstAliveOther = (s: GameState, selfId: string): string => s.players.find((p) => p.isAlive && p.id !== selfId)!.id;

// Controller that always lynches the werewolf during the day → villagers win.
const lynchWolf: PlayerController = {
  async chooseNightTalk() {
    return 'I say we strike.';
  },
  async chooseNightKill(state) {
    return firstAliveNonWolf(state);
  },
  async chooseInvestigation(state, seer) {
    return firstAliveOther(state, seer.id);
  },
  async chooseSpeech(_state, speaker) {
    return `${speaker.name} shares a thought.`; // non-empty so it's logged (empty = silent pass)
  },
  async chooseVote(state, voter) {
    const wolf = state.players.find((p) => p.isAlive && p.role === 'werewolf');
    if (wolf && wolf.id !== voter.id) return wolf.id;
    return firstAliveOther(state, voter.id);
  },
};

// Controller that never lynches the werewolf → night kills grind to a wolf win.
const spareWolf: PlayerController = {
  async chooseNightTalk() {
    return 'Let us pick someone.';
  },
  async chooseNightKill(state) {
    return firstAliveNonWolf(state);
  },
  async chooseInvestigation(state, seer) {
    return firstAliveOther(state, seer.id);
  },
  async chooseSpeech() {
    return '';
  },
  async chooseVote(state, voter) {
    const target = state.players.find((p) => p.isAlive && p.id !== voter.id && p.role !== 'werewolf');
    return (target ?? state.players.find((p) => p.isAlive && p.id !== voter.id)!).id;
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runGame', () => {
  it('plays a full game from lobby to a decided winner', async () => {
    const final = await runGame(lobby(), lynchWolf);
    expect(final.phaseData.phase).toBe('game-over');
  });

  it('lets villagers win when the day always lynches the werewolf', async () => {
    const final = await runGame(lobby(), lynchWolf);
    if (final.phaseData.phase === 'game-over') expect(final.phaseData.winner).toBe('villagers');
  });

  it('lets werewolves win when the day never lynches the wolf', async () => {
    const final = await runGame(lobby(), spareWolf);
    expect(final.phaseData.phase).toBe('game-over');
    if (final.phaseData.phase === 'game-over') expect(final.phaseData.winner).toBe('werewolves');
  });

  it('makes the human werewolf\'s vote the pack\'s kill, overriding NPC wolves', async () => {
    const players: Player[] = [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 'w2', name: 'You', role: 'werewolf', isAlive: true, isHuman: true },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Al', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v2', name: 'Bo', role: 'villager', isAlive: true, isHuman: false },
    ];
    const night: GameState = {
      round: 1,
      players,
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
    };

    // NPC wolf wants v1; the human wolf wants v2. The human's vote must win.
    const controller: PlayerController = {
      ...lynchWolf,
      async chooseNightKill(_state, wolf) {
        return wolf.isHuman ? 'v2' : 'v1';
      },
    };

    const final = await runGame(night, controller, { wolfTalkRounds: 1 });
    const firstNightKill = final.log.find((e) => e.type === 'elimination' && e.cause === 'night-kill');
    expect(firstNightKill?.type === 'elimination' ? firstNightKill.playerId : null).toBe('v2');
  });

  it('skips the opening-night discussion but runs it from round 2', async () => {
    const players: Player[] = [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 'w2', name: 'Wolf2', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Al', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v2', name: 'Bo', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v3', name: 'Cy', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v4', name: 'De', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v5', name: 'Ed', role: 'villager', isAlive: true, isHuman: false },
    ];
    const night: GameState = {
      round: 1,
      players,
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
    };

    // spareWolf never lynches a wolf, so both wolves survive into round 2 where the
    // discussion should run; record which round each pack message happened in.
    const talkRounds: number[] = [];
    const controller: PlayerController = {
      ...spareWolf,
      async chooseNightTalk(state) {
        talkRounds.push(state.round);
        return 'I propose a target.';
      },
    };

    const final = await runGame(night, controller, { wolfTalkRounds: 1 });
    expect(talkRounds).not.toContain(1); // opening night skipped
    expect(talkRounds).toContain(2); // discussion runs once there is history
    expect(final.phaseData.phase).toBe('game-over');
  });

  it('never asks a dead seer to investigate', async () => {
    const noSeer = roster().map((p) => (p.id === 's1' ? { ...p, isAlive: false } : p));
    const night: GameState = {
      round: 1,
      players: noSeer,
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
    };
    const investigate = vi.fn<PlayerController['chooseInvestigation']>().mockResolvedValue('w1');
    const controller: PlayerController = { ...lynchWolf, chooseInvestigation: investigate };

    const final = await runGame(night, controller);
    expect(investigate).not.toHaveBeenCalled();
    expect(final.phaseData.phase).toBe('game-over');
  });

  it('runs a private reflection after a non-opening-night death, and can be disabled', async () => {
    // spareWolf lynches a villager on day 1 (a round-2, non-terminal death that gets
    // reflected); the opening-night kill itself is intentionally NOT reflected.
    let reflectCalls = 0;
    const controller: PlayerController = {
      ...spareWolf,
      async reflect() {
        reflectCalls++;
      },
    };
    await runGame(lobby(), controller);
    expect(reflectCalls).toBeGreaterThan(0);

    let disabledCalls = 0;
    const disabled: PlayerController = {
      ...spareWolf,
      async reflect() {
        disabledCalls++;
      },
    };
    await runGame(lobby(), disabled, { reflectOnDeath: false });
    expect(disabledCalls).toBe(0);
  });

  it('does NOT reflect on the opening-night kill (it is random — nothing to deduce)', async () => {
    // Capture which game round each reflection happened in; none should be round 1.
    const reflectRounds: number[] = [];
    const controller: PlayerController = {
      ...spareWolf,
      async reflect(state) {
        reflectRounds.push(state.round);
      },
    };
    await runGame(lobby(), controller);
    expect(reflectRounds.length).toBeGreaterThan(0);
    expect(reflectRounds).not.toContain(1);
  });

  it('reveals the eliminated player\'s role in the log', async () => {
    const final = await runGame(lobby(), lynchWolf);
    const elimination = final.log.find((e) => e.type === 'elimination');
    expect(elimination?.type === 'elimination' ? elimination.role : undefined).toBeDefined();
  });

  it('randomises speaking order while every living player still speaks exactly once', async () => {
    const players: Player[] = [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Al', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v2', name: 'Bo', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v3', name: 'Cy', role: 'villager', isAlive: true, isHuman: false },
    ];
    const debate: GameState = {
      round: 1,
      players,
      log: [],
      seerKnowledge: {},
      wolfChat: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      phaseData: { phase: 'day-debate', speechesDone: [], round: 1 },
    };

    const spoke: string[] = [];
    const controller: PlayerController = {
      ...lynchWolf,
      async chooseSpeech(_state, speaker) {
        spoke.push(speaker.id);
        return '';
      },
    };

    await runGame(debate, controller);
    // The first debate round is the 5 alive players, each exactly once (a permutation).
    expect([...spoke.slice(0, 5)].sort()).toEqual(['s1', 'v1', 'v2', 'v3', 'w1']);
  });

  it('produces a log containing speeches, votes and eliminations', async () => {
    const final = await runGame(lobby(), lynchWolf);
    const types = new Set(final.log.map((e) => e.type));
    expect(types.has('speech')).toBe(true);
    expect(types.has('vote')).toBe(true);
    expect(types.has('elimination')).toBe(true);
  });

  it('drives a second voting round when the first ballot ties', async () => {
    // Start directly in day-vote with 4 alive players so we can force a tie.
    const players: Player[] = [
      { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
      { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
      { id: 'v1', name: 'Al', role: 'villager', isAlive: true, isHuman: false },
      { id: 'v2', name: 'Bo', role: 'villager', isAlive: true, isHuman: false },
    ];
    const dayVote: GameState = {
      round: 1,
      players,
      log: [],
      seerKnowledge: {},
      wolfChat: [],
      witchHealUsed: false,
      witchPoisonUsed: false,
      phaseData: { phase: 'day-vote', votes: {}, candidates: ['w1', 's1', 'v1', 'v2'], isRunoff: false },
    };

    let voteCalls = 0;
    const controller: PlayerController = {
      ...spareWolf,
      async chooseVote(state, voter) {
        voteCalls++;
        const pd = state.phaseData;
        if (pd.phase === 'day-vote' && pd.isRunoff) {
          return pd.candidates.find((c) => c !== voter.id)!;
        }
        // First ballot: w1 & s1 vote v1, v1 & v2 vote w1 → 2-2 tie.
        return voter.id === 'w1' || voter.id === 's1' ? 'v1' : 'w1';
      },
    };

    const final = await runGame(dayVote, controller);
    expect(voteCalls).toBeGreaterThan(players.length); // a runoff round happened
    expect(final.phaseData.phase).toBe('game-over');
  });
});
