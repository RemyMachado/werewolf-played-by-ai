import { z } from 'zod';
import { LogEntrySchema, RoleSchema, TeamSchema } from '../types/game';
import { PlayerViewSchema } from '../npc/view';

// The wire contract for the single-player web API: everything the server pushes to
// the client (over SSE) and everything the client posts back. Defined once here as
// Zod schemas so both ends validate against the same source of truth, reusing the
// engine's own types (LogEntry, Team, PlayerView) rather than redefining them.

// ---------------------------------------------------------------------------
// Prompts — what the human is asked when it is their turn to act
// ---------------------------------------------------------------------------

// One option offered for a 'select' prompt. `value` is what the client posts back:
// usually a player id, or a sentinel (e.g. abstain / don't-poison) the controller maps.
export const PromptChoiceSchema = z.object({ label: z.string(), value: z.string() });
export type PromptChoice = z.infer<typeof PromptChoiceSchema>;

export const PromptDtoSchema = z.discriminatedUnion('kind', [
  // Pick one of a fixed set of options: night kill, investigation, poison, vote.
  z.object({
    kind: z.literal('select'),
    promptId: z.string(),
    question: z.string(),
    choices: z.array(PromptChoiceSchema),
  }),
  // Free text: a speech, or a werewolf's message to the pack. Empty = stay quiet.
  z.object({
    kind: z.literal('text'),
    promptId: z.string(),
    question: z.string(),
  }),
  // A yes/no decision: the witch's healing potion.
  z.object({
    kind: z.literal('confirm'),
    promptId: z.string(),
    question: z.string(),
    confirmLabel: z.string(),
    denyLabel: z.string(),
  }),
]);
export type PromptDto = z.infer<typeof PromptDtoSchema>;

// ---------------------------------------------------------------------------
// Server → client events (streamed over SSE)
// ---------------------------------------------------------------------------

export const ServerEventSchema = z.discriminatedUnion('type', [
  // New public log entries since the last event (the public game history).
  z.object({ type: z.literal('log'), entries: z.array(LogEntrySchema) }),
  // The human's own player view — the ONLY per-player state allowed over the wire.
  z.object({ type: z.literal('view'), view: PlayerViewSchema }),
  // It is the human's turn: answer with POST /api/game/answer.
  z.object({ type: z.literal('prompt'), prompt: PromptDtoSchema }),
  // Live "who is acting now" feedback, emitted just before an NPC decision. `actorId`
  // is set only for public day actions (speaking/voting); night roles announce
  // generically (actorId null) so the Seer/Witch/wolves are never identified.
  z.object({ type: z.literal('activity'), label: z.string(), actorId: z.string().nullable() }),
  // Terminal: the game ended. The roster reveals EVERY player's true role (the game
  // is over, so the hidden-info boundary no longer applies).
  z.object({
    type: z.literal('game-over'),
    winner: TeamSchema,
    roster: z.array(z.object({ id: z.string(), name: z.string(), role: RoleSchema })),
  }),
  // Terminal: the game aborted (e.g. the LLM failed). Carries an actionable message.
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

// The human's answer to a prompt. `value` is interpreted against the pending
// prompt's kind: a choice value or text string, or a boolean for a confirm.
export const ClientAnswerSchema = z.object({
  promptId: z.string(),
  value: z.union([z.string(), z.null(), z.boolean()]),
});
export type ClientAnswer = z.infer<typeof ClientAnswerSchema>;

// Request body for starting a game. The server expands this into a full GameConfig
// (assigning ids/roles) so the client never builds the seating itself.
export const NewGameRequestSchema = z.object({
  players: z.number().int().positive(),
  werewolves: z.number().int().positive(),
  witch: z.boolean().optional(),
  humanName: z.string().min(1),
  seed: z.number().optional(), // reproducible shuffle + turn order
  wolfTalkRounds: z.number().int().positive().optional(),
  debateRounds: z.number().int().positive().optional(),
});
export type NewGameRequest = z.infer<typeof NewGameRequestSchema>;

// ---------------------------------------------------------------------------
// Answer validation — pure, so it is unit-testable and shared by the session
// ---------------------------------------------------------------------------

export type AnswerValidation = { ok: true; value: string | null | boolean } | { ok: false; message: string };

// Checks a posted answer against the prompt it claims to answer: a select value must
// be one of the offered choices, a text answer must be a string, a confirm must be a
// boolean. Keeps the session from resuming the game on an illegal move.
export function validateAnswer(dto: PromptDto, value: unknown): AnswerValidation {
  switch (dto.kind) {
    case 'select':
      if (typeof value !== 'string') return { ok: false, message: 'a select answer must be a string' };
      if (!dto.choices.some((c) => c.value === value)) return { ok: false, message: `"${value}" is not an offered choice` };
      return { ok: true, value };
    case 'text':
      if (typeof value !== 'string') return { ok: false, message: 'a text answer must be a string' };
      return { ok: true, value };
    case 'confirm':
      if (typeof value !== 'boolean') return { ok: false, message: 'a confirm answer must be a boolean' };
      return { ok: true, value };
  }
}
