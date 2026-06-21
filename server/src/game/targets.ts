import { GameState, Player } from '../types/game';
import { getAlivePlayers } from './state';

// Legal-move queries shared by every controller (CLI, NPC, web), so the human and
// the NPCs are always offered exactly the same choices the engine will accept.

// Werewolves may kill any living non-werewolf.
export function nightKillTargets(state: GameState): Player[] {
  return getAlivePlayers(state).filter((p) => p.role !== 'werewolf');
}

// The seer may investigate any living player other than themselves.
export function investigationTargets(state: GameState, seerId: string): Player[] {
  return getAlivePlayers(state).filter((p) => p.id !== seerId);
}

// The witch may poison any living player other than themselves.
export function poisonTargets(state: GameState, witchId: string): Player[] {
  return getAlivePlayers(state).filter((p) => p.id !== witchId);
}

// A voter may vote for any living, eligible candidate other than themselves.
// During a runoff the eligible set is just the tied players; otherwise everyone.
export function voteTargets(state: GameState, voterId: string): Player[] {
  const pd = state.phaseData;
  const eligible = pd.phase === 'day-vote' ? pd.candidates : getAlivePlayers(state).map((p) => p.id);
  return getAlivePlayers(state).filter((p) => p.id !== voterId && eligible.includes(p.id));
}
