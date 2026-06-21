import { GameConfig, GameState, Player } from '../types/game';
import { getTeam } from './roles';
import { Rng, shuffle } from './rng';

const MIN_PLAYERS = 3;

// Validates a config before any state is built. Each rule rejects a class of
// games that would be unfair or already decided at creation.
function assertValidConfig(config: GameConfig): void {
  const { players: configs, werewolfCount } = config;

  if (configs.length < MIN_PLAYERS) {
    throw new Error(`A game needs at least ${MIN_PLAYERS} players`);
  }
  if (werewolfCount < 1) {
    throw new Error('A game needs at least 1 werewolf');
  }
  // Villager side = everyone who is not a werewolf (the seer counts as a villager).
  // Require it to strictly outnumber the wolves, otherwise the game is won the
  // instant it starts (see checkWinCondition).
  if (configs.length <= 2 * werewolfCount) {
    throw new Error('Villagers must strictly outnumber werewolves at game start');
  }
  const uniqueIds = new Set(configs.map((c) => c.id));
  if (uniqueIds.size !== configs.length) {
    throw new Error('Player ids must be unique');
  }
  // Names must be unique too: NPCs choose targets by name, so duplicates would be
  // ambiguous to resolve back to a player.
  const uniqueNames = new Set(configs.map((c) => c.name.trim().toLowerCase()));
  if (uniqueNames.size !== configs.length) {
    throw new Error('Player names must be unique');
  }
  // The witch needs its own seat after the wolves and the seer.
  if (config.includeWitch && configs.length < werewolfCount + 2) {
    throw new Error('Not enough players to include a Witch');
  }
}

export function createGame(config: GameConfig, rng: Rng = Math.random): GameState {
  assertValidConfig(config);
  const { players: configs, werewolfCount, includeWitch } = config;

  // Shuffle then assign roles by position: first N → werewolf, next → seer, next →
  // witch (if enabled), the rest → villager. The shuffle is what makes it fair.
  const witchIndex = includeWitch ? werewolfCount + 1 : -1;
  const shuffled = shuffle(configs, rng);
  const players: Player[] = shuffled.map((p, i) => ({
    id: p.id,
    name: p.name,
    isHuman: p.isHuman,
    isAlive: true,
    role: i < werewolfCount ? 'werewolf' : i === werewolfCount ? 'seer' : i === witchIndex ? 'witch' : 'villager',
  }));

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

// ---------------------------------------------------------------------------
// Pure selectors
// ---------------------------------------------------------------------------

export function getAlivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.isAlive);
}

export function getAliveWerewolves(state: GameState): Player[] {
  return getAlivePlayers(state).filter((p) => p.role === 'werewolf');
}

export function getAliveVillagerSide(state: GameState): Player[] {
  return getAlivePlayers(state).filter((p) => getTeam(p.role) === 'villagers');
}

export function getPlayerById(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Player not found: ${id}`);
  return player;
}

export function getSeer(state: GameState): Player | undefined {
  return state.players.find((p) => p.role === 'seer');
}

export function getWitch(state: GameState): Player | undefined {
  return state.players.find((p) => p.role === 'witch');
}

// Returns the ids of other living werewolves — used to build werewolf NPC context
export function getAliveWerewolfPartners(state: GameState, playerId: string): Player[] {
  return getAliveWerewolves(state).filter((p) => p.id !== playerId);
}
