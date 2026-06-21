import { GameState, LogEntry, Role } from '../types/game';
import { getPlayerById } from '../game/state';

export type PlayerRef = { id: string; name: string };
export type SeerFinding = { player: PlayerRef; role: Role };

// Everything a single player is legitimately allowed to know. This is the
// hidden-information boundary: anything NOT in here must never reach that
// player's prompt. Other players' roles are deliberately absent — they leak
// only through werewolfAllies (your own pack) and seerFindings (your own scrying).
export type PlayerView = {
  self: { id: string; name: string; role: Role };
  round: number; // current round, so callers can tell past votes from the live tally
  composition: Record<Role, number>; // how many of each role the game STARTED with — public setup info (counts, never who)
  alive: PlayerRef[]; // includes self; role NOT exposed (still hidden)
  dead: (PlayerRef & { role: Role })[]; // dead players' roles are public (revealed on death)
  werewolfAllies: PlayerRef[]; // non-empty only if self is a werewolf
  seerFindings: SeerFinding[]; // non-empty only if self is the seer
  wolfChat: { speaker: string; text: string; round: number }[]; // werewolves only
  wolfVotes: { voter: string; target: string }[]; // werewolves only, this night
  witchPotions: { heal: boolean; poison: boolean } | null; // only if self is the witch (true = still available)
  log: LogEntry[]; // the full public log — every entry in it is public by design
};

const toRef = (p: { id: string; name: string }): PlayerRef => ({ id: p.id, name: p.name });

export function buildPlayerView(state: GameState, playerId: string): PlayerView {
  const self = getPlayerById(state, playerId);

  const werewolfAllies =
    self.role === 'werewolf'
      ? state.players.filter((p) => p.role === 'werewolf' && p.id !== self.id).map(toRef)
      : [];

  const seerFindings: SeerFinding[] =
    self.role === 'seer'
      ? Object.entries(state.seerKnowledge).map(([id, role]) => ({
          player: toRef(getPlayerById(state, id)),
          role,
        }))
      : [];

  const isWolf = self.role === 'werewolf';
  const wolfChat = isWolf
    ? state.wolfChat.map((m) => ({ speaker: getPlayerById(state, m.wolfId).name, text: m.text, round: m.round }))
    : [];
  const wolfVotes =
    isWolf && state.phaseData.phase === 'night'
      ? Object.entries(state.phaseData.wolfVotes).map(([voterId, targetId]) => ({
          voter: getPlayerById(state, voterId).name,
          target: getPlayerById(state, targetId).name,
        }))
      : [];

  // Starting role counts — public setup knowledge (how many of each role, never who).
  // Roles never change, so counting all players (alive + dead) gives the game's
  // opening composition; players can subtract revealed-dead roles to deduce what
  // remains. This is aggregate info only, so it does not breach the hidden boundary.
  const composition: Record<Role, number> = { villager: 0, werewolf: 0, seer: 0, witch: 0 };
  for (const p of state.players) composition[p.role]++;

  return {
    self: { id: self.id, name: self.name, role: self.role },
    round: state.round,
    composition,
    alive: state.players.filter((p) => p.isAlive).map(toRef),
    dead: state.players.filter((p) => !p.isAlive).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    werewolfAllies,
    seerFindings,
    wolfChat,
    wolfVotes,
    witchPotions: self.role === 'witch' ? { heal: !state.witchHealUsed, poison: !state.witchPoisonUsed } : null,
    log: state.log,
  };
}
