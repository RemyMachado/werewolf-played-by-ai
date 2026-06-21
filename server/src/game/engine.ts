import { GameState, LogEntry, Player, Team } from '../types/game';
import {
  getAlivePlayers,
  getAliveVillagerSide,
  getAliveWerewolves,
  getPlayerById,
} from './state';

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

// Returns the winning team if the game is decided, or null if it continues.
// Call this after every state-mutating step (night kill, day vote elimination).
export function checkWinCondition(state: GameState): Team | null {
  if (getAliveWerewolves(state).length === 0) return 'villagers';
  if (getAliveWerewolves(state).length >= getAliveVillagerSide(state).length) return 'werewolves';
  return null;
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

export function startGame(state: GameState): GameState {
  if (state.phaseData.phase !== 'lobby') throw new Error('Game already started');
  return {
    ...state,
    round: 1,
    phaseData: {
      phase: 'night',
      pendingKillTarget: null,
      pendingInvestigateTarget: null,
      wolfVotes: {},
      pendingHeal: false,
      pendingPoison: null,
    },
    log: [...state.log, { type: 'phase-change', round: 1, phase: 'night' }],
  };
}

// ---------------------------------------------------------------------------
// Night phase
// ---------------------------------------------------------------------------

export function setNightKillTarget(state: GameState, werewolfId: string, targetId: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');

  const actor = getPlayerById(state, werewolfId);
  if (actor.role !== 'werewolf') throw new Error(`${werewolfId} is not a werewolf`);
  if (!actor.isAlive) throw new Error(`${werewolfId} is dead`);

  const target = getPlayerById(state, targetId);
  if (!target.isAlive) throw new Error(`${targetId} is already dead`);
  if (target.role === 'werewolf') throw new Error('Werewolves cannot target another werewolf');

  return {
    ...state,
    phaseData: { ...state.phaseData, pendingKillTarget: targetId },
  };
}

export function setNightInvestigateTarget(state: GameState, seerId: string, targetId: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');

  const actor = getPlayerById(state, seerId);
  if (actor.role !== 'seer') throw new Error(`${seerId} is not the seer`);
  if (!actor.isAlive) throw new Error(`${seerId} is dead`);

  const target = getPlayerById(state, targetId);
  if (!target.isAlive) throw new Error(`${targetId} is already dead`);
  if (target.id === actor.id) throw new Error('The seer cannot investigate themselves');

  // The seer learns the role at the moment of investigation — recorded privately
  // and immediately. There is no reason to defer it to resolveNight (no other night
  // actor reads seer knowledge), and recording it now lets watch mode reveal the
  // finding right after the seer acts, instead of a phase later during the day.
  return {
    ...state,
    seerKnowledge: { ...state.seerKnowledge, [targetId]: target.role },
    phaseData: { ...state.phaseData, pendingInvestigateTarget: targetId },
  };
}

// Appends a werewolf's message to the private night discussion.
export function recordWolfMessage(state: GameState, wolfId: string, text: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');
  const wolf = getPlayerById(state, wolfId);
  if (wolf.role !== 'werewolf') throw new Error(`${wolfId} is not a werewolf`);
  if (!wolf.isAlive) throw new Error(`${wolfId} is dead`);
  return {
    ...state,
    wolfChat: [...state.wolfChat, { round: state.round, wolfId, text }],
  };
}

// Records a werewolf's kill vote for this night. Same target rules as a direct
// kill: a living non-werewolf.
export function recordWolfKillVote(state: GameState, wolfId: string, targetId: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');
  const wolf = getPlayerById(state, wolfId);
  if (wolf.role !== 'werewolf') throw new Error(`${wolfId} is not a werewolf`);
  if (!wolf.isAlive) throw new Error(`${wolfId} is dead`);
  const target = getPlayerById(state, targetId);
  if (!target.isAlive) throw new Error(`${targetId} is already dead`);
  if (target.role === 'werewolf') throw new Error('Werewolves cannot target another werewolf');
  return {
    ...state,
    phaseData: { ...state.phaseData, wolfVotes: { ...state.phaseData.wolfVotes, [wolfId]: targetId } },
  };
}

// Decides the pack's victim from the wolves' kill votes. A human wolf, if present,
// has the final say (their vote is the kill); otherwise the majority wins, with
// ties broken by player seating order. Throws if there are no votes.
export function resolveWolfKill(
  wolfVotes: Record<string, string>,
  players: Player[],
  humanWolfId?: string,
): string {
  if (humanWolfId && wolfVotes[humanWolfId]) return wolfVotes[humanWolfId];

  const counts: Record<string, number> = {};
  for (const target of Object.values(wolfVotes)) counts[target] = (counts[target] ?? 0) + 1;

  const tallies = Object.values(counts);
  if (tallies.length === 0) throw new Error('No wolf kill votes to resolve');

  const max = Math.max(...tallies);
  const tied = Object.keys(counts).filter((t) => counts[t] === max);
  if (tied.length === 1) return tied[0];
  return players.find((p) => tied.includes(p.id))!.id; // tie → first in seating order
}

// The witch saves the wolves' victim this night (uses the healing potion once).
export function setWitchHeal(state: GameState, witchId: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');
  const witch = getPlayerById(state, witchId);
  if (witch.role !== 'witch') throw new Error(`${witchId} is not the witch`);
  if (!witch.isAlive) throw new Error(`${witchId} is dead`);
  if (state.witchHealUsed) throw new Error('The healing potion is already used');
  if (state.phaseData.pendingKillTarget === null) throw new Error('There is no victim to heal');
  return { ...state, phaseData: { ...state.phaseData, pendingHeal: true } };
}

// The witch poisons a player this night (uses the poison potion once).
export function setWitchPoison(state: GameState, witchId: string, targetId: string): GameState {
  if (state.phaseData.phase !== 'night') throw new Error('Not night phase');
  const witch = getPlayerById(state, witchId);
  if (witch.role !== 'witch') throw new Error(`${witchId} is not the witch`);
  if (!witch.isAlive) throw new Error(`${witchId} is dead`);
  if (state.witchPoisonUsed) throw new Error('The poison potion is already used');
  const target = getPlayerById(state, targetId);
  if (!target.isAlive) throw new Error(`${targetId} is already dead`);
  return { ...state, phaseData: { ...state.phaseData, pendingPoison: targetId } };
}

// Applies night actions, then transitions to day-debate or game-over. A night can
// now produce 0–2 deaths: the wolf victim (unless the witch heals) plus a poison.
export function resolveNight(state: GameState): GameState {
  const { phaseData } = state;
  if (phaseData.phase !== 'night') throw new Error('Not night phase');
  const { pendingKillTarget, pendingHeal, pendingPoison } = phaseData;

  // (The seer's finding was already recorded in setNightInvestigateTarget.)

  // Collect deaths: the wolf victim (unless healed), and the witch's poison target.
  // Dedupe by id so a player targeted by both isn't counted twice.
  const deaths: { id: string; cause: 'night-kill' | 'poison' }[] = [];
  if (pendingKillTarget && !pendingHeal) deaths.push({ id: pendingKillTarget, cause: 'night-kill' });
  if (pendingPoison && pendingPoison !== pendingKillTarget) deaths.push({ id: pendingPoison, cause: 'poison' });

  const deadIds = new Set(deaths.map((d) => d.id));
  const players = state.players.map((p) => (deadIds.has(p.id) ? { ...p, isAlive: false } : p));
  const eliminations: LogEntry[] = deaths.map((d) => ({
    type: 'elimination',
    round: state.round,
    playerId: d.id,
    role: getPlayerById(state, d.id).role,
    cause: d.cause,
  }));
  // If the wolves struck but their victim survived (the witch healed them), announce
  // publicly that no one died so the night isn't a confusing silence. Only when a
  // victim was actually chosen — a night with no kill at all happens only in tests.
  const newLog: LogEntry[] =
    eliminations.length > 0
      ? eliminations
      : pendingKillTarget !== null
        ? [{ type: 'no-elimination', round: state.round, reason: 'no-night-death' }]
        : [];

  const afterNight: GameState = {
    ...state,
    players,
    witchHealUsed: state.witchHealUsed || pendingHeal,
    witchPoisonUsed: state.witchPoisonUsed || pendingPoison !== null,
    log: [...state.log, ...newLog],
  };

  const winner = checkWinCondition(afterNight);
  if (winner) return toGameOver(afterNight, winner);

  return {
    ...afterNight,
    phaseData: { phase: 'day-debate', speechesDone: [], round: 1 },
    log: [...afterNight.log, { type: 'phase-change', round: afterNight.round, phase: 'day-debate' }],
  };
}

// ---------------------------------------------------------------------------
// Day debate phase
// ---------------------------------------------------------------------------

// Records one speech. `totalRounds` is how many debate rounds the day runs (default
// 1 = a single pass, the classic rule). Once everyone has spoken in the current
// round, the day either starts the next reaction round (resetting who has spoken) or,
// if this was the last round, moves to the vote.
export function recordSpeech(state: GameState, playerId: string, text: string, totalRounds = 1): GameState {
  if (state.phaseData.phase !== 'day-debate') throw new Error('Not day-debate phase');
  const player = getPlayerById(state, playerId);
  if (!player.isAlive) throw new Error(`${playerId} is dead`);
  if (state.phaseData.speechesDone.includes(playerId)) throw new Error(`${playerId} already spoke this round`);

  // An empty speech is a silent pass: the player has taken their turn (so the round
  // can complete) but adds no public line. This is how a player can stay quiet in a
  // reaction round when they have nothing to add.
  const spoke = text.trim().length > 0;
  const newState: GameState = {
    ...state,
    phaseData: {
      ...state.phaseData,
      speechesDone: [...state.phaseData.speechesDone, playerId],
    },
    log: spoke ? [...state.log, { type: 'speech', round: state.round, playerId, text }] : state.log,
  };

  return advanceDebate(newState, totalRounds);
}

// After a speech: if the current round isn't finished, stay put. If it is, either
// open the next reaction round (clear speechesDone, bump the round) or — when the
// last round is done — transition to the vote.
function advanceDebate(state: GameState, totalRounds: number): GameState {
  const { phaseData } = state;
  if (phaseData.phase !== 'day-debate') return state;

  const alive = getAlivePlayers(state);
  const allSpoke = alive.every((p) => phaseData.speechesDone.includes(p.id));
  if (!allSpoke) return state;

  if (phaseData.round < totalRounds) {
    return { ...state, phaseData: { ...phaseData, speechesDone: [], round: phaseData.round + 1 } };
  }

  return {
    ...state,
    phaseData: {
      phase: 'day-vote',
      votes: {},
      candidates: alive.map((p) => p.id),
      isRunoff: false,
    },
    log: [...state.log, { type: 'phase-change', round: state.round, phase: 'day-vote' }],
  };
}

// ---------------------------------------------------------------------------
// Day vote phase
// ---------------------------------------------------------------------------

// targetId is the chosen player's id, or null to abstain (cast no vote).
export function recordVote(state: GameState, voterId: string, targetId: string | null): GameState {
  if (state.phaseData.phase !== 'day-vote') throw new Error('Not day-vote phase');
  const voter = getPlayerById(state, voterId);
  if (!voter.isAlive) throw new Error(`${voterId} is dead`);

  if (targetId !== null) {
    const target = getPlayerById(state, targetId);
    if (!target.isAlive) throw new Error(`${targetId} is dead`);
    if (voterId === targetId) throw new Error('A player cannot vote for themselves');
    if (!state.phaseData.candidates.includes(targetId)) {
      throw new Error(`${targetId} is not a candidate this round`);
    }
  }

  const newState: GameState = {
    ...state,
    phaseData: {
      ...state.phaseData,
      votes: { ...state.phaseData.votes, [voterId]: targetId },
    },
    log: [...state.log, { type: 'vote', round: state.round, voterId, targetId }],
  };

  return tryResolveVotes(newState);
}

// Resolves votes once every alive player has voted. No-op otherwise.
// Follows the official tie rule: a first-ballot tie goes to a runoff between the
// tied players only; a tie that persists through the runoff eliminates no one.
function tryResolveVotes(state: GameState): GameState {
  const { phaseData } = state;
  if (phaseData.phase !== 'day-vote') return state;

  const alive = getAlivePlayers(state);
  const allVoted = alive.every((p) => p.id in phaseData.votes);
  if (!allVoted) return state;

  // Tally — abstentions (null) don't count toward anyone.
  const tally: Record<string, number> = {};
  for (const targetId of Object.values(phaseData.votes)) {
    if (targetId === null) continue;
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  }

  // Nobody cast a real vote (all abstained) → no elimination.
  if (Object.keys(tally).length === 0) return advanceToNight(withNoElimination(state, 'all-abstained'));

  const maxVotes = Math.max(...Object.values(tally));
  const leaders = Object.keys(tally).filter((id) => tally[id] === maxVotes);

  // Clear winner → eliminate them.
  if (leaders.length === 1) return eliminateByVote(state, leaders[0]);

  // First-ballot tie → hold a runoff between the tied players only.
  if (!phaseData.isRunoff) {
    return {
      ...state,
      phaseData: { phase: 'day-vote', votes: {}, candidates: leaders, isRunoff: true },
      log: [...state.log, { type: 'runoff', round: state.round, candidates: leaders }],
    };
  }

  // Tie persists through the runoff → the village fails to decide; nobody dies.
  return advanceToNight(withNoElimination(state, 'runoff-tie'));
}

// Records that the day ended with no one eliminated (so the public log — and the
// watch output — explain the silent jump to night instead of leaving a gap).
function withNoElimination(state: GameState, reason: 'runoff-tie' | 'all-abstained'): GameState {
  return { ...state, log: [...state.log, { type: 'no-elimination', round: state.round, reason }] };
}

// Eliminates a player by day vote, then ends the game or moves to night.
function eliminateByVote(state: GameState, eliminatedId: string): GameState {
  const players = state.players.map((p) => (p.id === eliminatedId ? { ...p, isAlive: false } : p));
  const afterVote: GameState = {
    ...state,
    players,
    log: [
      ...state.log,
      {
        type: 'elimination',
        round: state.round,
        playerId: eliminatedId,
        role: getPlayerById(state, eliminatedId).role,
        cause: 'vote',
      },
    ],
  };

  const winner = checkWinCondition(afterVote);
  if (winner) return toGameOver(afterVote, winner);
  return advanceToNight(afterVote);
}

// Advances to the next night, bumping the round counter.
function advanceToNight(state: GameState): GameState {
  const nextRound = state.round + 1;
  return {
    ...state,
    round: nextRound,
    phaseData: {
      phase: 'night',
      pendingKillTarget: null,
      pendingInvestigateTarget: null,
      wolfVotes: {},
      pendingHeal: false,
      pendingPoison: null,
    },
    log: [...state.log, { type: 'phase-change', round: nextRound, phase: 'night' }],
  };
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function toGameOver(state: GameState, winner: Team): GameState {
  return {
    ...state,
    phaseData: { phase: 'game-over', winner },
    log: [...state.log, { type: 'phase-change', round: state.round, phase: 'game-over' }],
  };
}
