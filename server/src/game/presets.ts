import { GameConfig } from '../types/game';

export type Preset = { label: string; players: number; werewolves: number; witch: boolean };

// Player-count presets. The 8+ entries follow the official Werewolf guideline of
// roughly one werewolf per four players; 5–7 are below the official range but play
// fine with the current core roles for quick solo games. The Witch is an official
// special role for 8+ player games, so it is included from the 8-player preset up.
export const PRESETS: Preset[] = [
  { label: '5 players, 1 werewolf (quick)', players: 5, werewolves: 1, witch: false },
  { label: '6 players, 1 werewolf', players: 6, werewolves: 1, witch: false },
  { label: '8 players, 2 werewolves, witch (official minimum)', players: 8, werewolves: 2, witch: true },
  { label: '10 players, 2 werewolves, witch', players: 10, werewolves: 2, witch: true },
  { label: '12 players, 3 werewolves, witch', players: 12, werewolves: 3, witch: true },
];

const NAME_POOL = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Heidi',
  'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Peggy', 'Trent', 'Victor',
];

// Builds the player list for a game. If humanName is given, that player takes the
// first seat and is flagged isHuman; the remaining seats are filled from the name
// pool, skipping any clash with the human's name (player names must be unique).
export function buildPlayers(count: number, humanName: string | null): GameConfig['players'] {
  const names: string[] = [];
  if (humanName) names.push(humanName);
  for (const name of NAME_POOL) {
    if (names.length >= count) break;
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  if (names.length < count) throw new Error(`Not enough names in the pool for ${count} players`);
  return names.map((name, i) => ({ id: `p${i + 1}`, name, isHuman: humanName != null && i === 0 }));
}
