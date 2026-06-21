import { z } from 'zod';
import { GameState, LogEntrySchema, Role, RoleSchema } from '../types/game';
import { getPlayerById } from '../game/state';

export const PlayerRefSchema = z.object({ id: z.string(), name: z.string() });
export type PlayerRef = z.infer<typeof PlayerRefSchema>;

export const SeerFindingSchema = z.object({ player: PlayerRefSchema, role: RoleSchema });
export type SeerFinding = z.infer<typeof SeerFindingSchema>;

// Everything a single player is legitimately allowed to know. This is the
// hidden-information boundary: anything NOT in here must never reach that
// player's prompt — and (Phase 4) must never cross the wire to a client. Other
// players' roles are deliberately absent — they leak only through werewolfAllies
// (your own pack) and seerFindings (your own scrying). Defined as a Zod schema so
// the network protocol can validate it as the single source of truth.
export const PlayerViewSchema = z.object({
  self: z.object({ id: z.string(), name: z.string(), role: RoleSchema }),
  round: z.number(), // current round, so callers can tell past votes from the live tally
  // how many of each role the game STARTED with — public setup info (counts, never who).
  // An explicit per-role object (not z.record) so the type is a COMPLETE Record<Role,number>,
  // not a Partial — callers index it directly.
  composition: z.object({
    villager: z.number(),
    werewolf: z.number(),
    seer: z.number(),
    witch: z.number(),
  }),
  alive: z.array(PlayerRefSchema), // includes self; role NOT exposed (still hidden)
  dead: z.array(PlayerRefSchema.extend({ role: RoleSchema })), // dead players' roles are public (revealed on death)
  werewolfAllies: z.array(PlayerRefSchema), // non-empty only if self is a werewolf
  seerFindings: z.array(SeerFindingSchema), // non-empty only if self is the seer
  wolfChat: z.array(z.object({ speaker: z.string(), text: z.string(), round: z.number() })), // werewolves only
  wolfVotes: z.array(z.object({ voter: z.string(), target: z.string() })), // werewolves only, this night
  witchPotions: z.object({ heal: z.boolean(), poison: z.boolean() }).nullable(), // only if self is the witch (true = still available)
  log: z.array(LogEntrySchema), // the full public log — every entry in it is public by design
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

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
