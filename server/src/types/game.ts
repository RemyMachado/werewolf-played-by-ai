import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const RoleSchema = z.enum(['villager', 'werewolf', 'seer', 'witch']);
export type Role = z.infer<typeof RoleSchema>;

export const TeamSchema = z.enum(['villagers', 'werewolves']);
export type Team = z.infer<typeof TeamSchema>;

// Single source of truth for phase names. PhaseDataSchema's discriminator literals
// and the phase-change log entry both derive their strings from here.
export const PhaseSchema = z.enum(['lobby', 'night', 'day-debate', 'day-vote', 'game-over']);
export type Phase = z.infer<typeof PhaseSchema>;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
  isAlive: z.boolean(),
  isHuman: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;

// ---------------------------------------------------------------------------
// Log entries — public game history, visible to all players
// ---------------------------------------------------------------------------

export const LogEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('speech'),
    round: z.number(),
    playerId: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('vote'),
    round: z.number(),
    voterId: z.string(),
    targetId: z.string().nullable(), // null = the voter abstained
  }),
  z.object({
    type: z.literal('elimination'),
    round: z.number(),
    playerId: z.string(),
    role: RoleSchema, // the dead player's role, revealed to everyone on death
    cause: z.enum(['vote', 'night-kill', 'poison']),
  }),
  z.object({
    type: z.literal('runoff'),
    round: z.number(),
    candidates: z.array(z.string()), // tied players going to a runoff vote
  }),
  z.object({
    type: z.literal('no-elimination'),
    round: z.number(),
    // why no one was eliminated: a runoff that still tied, everyone abstaining, or a
    // night where the wolves' victim survived (the witch's heal — announced publicly,
    // since everyone wakes to find no body, without revealing who saved whom).
    reason: z.enum(['runoff-tie', 'all-abstained', 'no-night-death']),
  }),
  z.object({
    type: z.literal('phase-change'),
    round: z.number(),
    phase: PhaseSchema,
  }),
]);
export type LogEntry = z.infer<typeof LogEntrySchema>;

// ---------------------------------------------------------------------------
// Phase data — discriminated union so each phase carries only what it needs
// ---------------------------------------------------------------------------

export const PhaseDataSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal(PhaseSchema.enum.lobby),
  }),
  z.object({
    phase: z.literal(PhaseSchema.enum.night),
    pendingKillTarget: z.string().nullable(),
    pendingInvestigateTarget: z.string().nullable(),
    wolfVotes: z.record(z.string(), z.string()), // wolfId -> kill target, this night only
    pendingHeal: z.boolean(), // witch saving the wolves' victim this night
    pendingPoison: z.string().nullable(), // witch's poison target this night, or null
  }),
  z.object({
    phase: z.literal(PhaseSchema.enum['day-debate']),
    speechesDone: z.array(z.string()), // player ids who have spoken in the CURRENT debate round
    round: z.number(), // which debate round this is (1-based); a day can hold several reaction rounds
  }),
  z.object({
    phase: z.literal(PhaseSchema.enum['day-vote']),
    votes: z.record(z.string(), z.string().nullable()), // voterId -> targetId, or null if abstained
    candidates: z.array(z.string()), // ids eligible to be voted for this round
    isRunoff: z.boolean(), // true during a tie-break runoff round
  }),
  z.object({
    phase: z.literal(PhaseSchema.enum['game-over']),
    winner: TeamSchema,
  }),
]);
export type PhaseData = z.infer<typeof PhaseDataSchema>;

// ---------------------------------------------------------------------------
// Full game state
// ---------------------------------------------------------------------------

export const GameStateSchema = z.object({
  round: z.number(),
  players: z.array(PlayerSchema),
  log: z.array(LogEntrySchema),
  // Seer's private accumulated knowledge: playerId -> discovered role.
  // Only the seer NPC and the game engine read this.
  seerKnowledge: z.record(z.string(), RoleSchema),
  // Werewolves' private night discussion, persistent across nights. Only werewolves
  // ever see this — it is never part of the public log.
  wolfChat: z.array(z.object({ round: z.number(), wolfId: z.string(), text: z.string() })),
  // The witch's two single-use potions (once each per game).
  witchHealUsed: z.boolean(),
  witchPoisonUsed: z.boolean(),
  phaseData: PhaseDataSchema,
});
export type GameState = z.infer<typeof GameStateSchema>;

// ---------------------------------------------------------------------------
// Game configuration
// ---------------------------------------------------------------------------

export const GameConfigSchema = z.object({
  players: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isHuman: z.boolean(),
    }),
  ),
  werewolfCount: z.number().int().positive(),
  includeWitch: z.boolean().optional(), // add a Witch role (official: 8+ player games)
});
export type GameConfig = z.infer<typeof GameConfigSchema>;
