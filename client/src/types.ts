// Type-only mirror of the server's wire contract (server/src/api/protocol.ts and
// npc/view.ts). The server is the single source of validation truth; these are just
// the shapes the UI renders, kept type-only so no server/engine code reaches the
// browser bundle.

export type Role = 'villager' | 'werewolf' | 'seer' | 'witch';
export type Team = 'villagers' | 'werewolves';
export type Phase = 'lobby' | 'night' | 'day-debate' | 'day-vote' | 'game-over';

export type LogEntry =
  | { type: 'speech'; round: number; playerId: string; text: string }
  | { type: 'vote'; round: number; voterId: string; targetId: string | null }
  | { type: 'elimination'; round: number; playerId: string; role: Role; cause: 'vote' | 'night-kill' | 'poison' }
  | { type: 'runoff'; round: number; candidates: string[] }
  | { type: 'no-elimination'; round: number; reason: 'runoff-tie' | 'all-abstained' | 'no-night-death' }
  | { type: 'phase-change'; round: number; phase: Phase };

export type PlayerRef = { id: string; name: string };

export type PlayerView = {
  self: { id: string; name: string; role: Role };
  round: number;
  composition: Record<Role, number>;
  alive: PlayerRef[];
  dead: (PlayerRef & { role: Role })[];
  werewolfAllies: PlayerRef[];
  seerFindings: { player: PlayerRef; role: Role }[];
  wolfChat: { speaker: string; text: string; round: number }[];
  wolfVotes: { voter: string; target: string }[];
  witchPotions: { heal: boolean; poison: boolean } | null;
  log: LogEntry[];
};

export type PromptChoice = { label: string; value: string };

export type PromptDto =
  | { kind: 'select'; promptId: string; question: string; choices: PromptChoice[] }
  | { kind: 'text'; promptId: string; question: string }
  | { kind: 'confirm'; promptId: string; question: string; confirmLabel: string; denyLabel: string };

export type ServerEvent =
  | { type: 'log'; entries: LogEntry[] }
  | { type: 'view'; view: PlayerView }
  | { type: 'prompt'; prompt: PromptDto }
  | { type: 'activity'; label: string; actorId: string | null }
  | { type: 'game-over'; winner: Team }
  | { type: 'error'; message: string };

export type ClientAnswer = { promptId: string; value: string | null | boolean };

export type NewGameRequest = {
  players: number;
  werewolves: number;
  witch?: boolean;
  humanName: string;
  seed?: number;
  wolfTalkRounds?: number;
  debateRounds?: number;
};
