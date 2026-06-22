import { LogEntry, Phase, PlayerView, Role } from './types';

const ROLE_LABEL: Record<Role, string> = {
  villager: 'Villager',
  werewolf: 'Werewolf',
  seer: 'Seer',
  witch: 'Witch',
};

export const roleLabel = (role: Role): string => ROLE_LABEL[role];

// Whether the board should wear its night skin: true until the first day, then driven
// by the most recent phase-change. Games open at night.
export function isNightPhase(log: LogEntry[]): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type === 'phase-change') return e.phase === 'night';
  }
  return true;
}

// The most recent phase the game entered, or null before the first phase-change.
export function currentPhase(log: LogEntry[]): Phase | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === 'phase-change') return (log[i] as Extract<LogEntry, { type: 'phase-change' }>).phase;
  }
  return null;
}

// Resolves player ids to names using the human's view (every player is either alive
// or dead in it, plus self), falling back to the raw id if somehow unknown.
export function nameLookup(view: PlayerView | null): (id: string) => string {
  const map = new Map<string, string>();
  if (view) {
    map.set(view.self.id, view.self.name);
    for (const p of view.alive) map.set(p.id, p.name);
    for (const p of view.dead) map.set(p.id, p.name);
  }
  return (id) => map.get(id) ?? id;
}

// Resolves player ids to their role ONLY where it is legitimately known — the human
// themselves and the dead (revealed on death). Living others return undefined, so the
// log can colour known roles without ever leaking a living player's role.
export function roleLookup(view: PlayerView | null): (id: string) => Role | undefined {
  const map = new Map<string, Role>();
  if (view) {
    map.set(view.self.id, view.self.role);
    for (const p of view.dead) map.set(p.id, p.role);
  }
  return (id) => map.get(id);
}

const CAUSE_VERB: Record<Extract<LogEntry, { type: 'elimination' }>['cause'], string> = {
  vote: 'was voted out',
  'night-kill': 'was killed in the night',
  poison: 'was poisoned',
};

const NO_ELIM_REASON: Record<Extract<LogEntry, { type: 'no-elimination' }>['reason'], string> = {
  'runoff-tie': 'the runoff tied — no one is voted out',
  'all-abstained': 'everyone abstained — no one is voted out',
  'no-night-death': 'no one died during the night',
};

// A one-line, human-readable rendering of a public log entry. Phase-change entries
// are handled separately by the log component (rendered as dividers).
export function formatLogEntry(e: LogEntry, name: (id: string) => string): string {
  switch (e.type) {
    case 'speech':
      return `${name(e.playerId)}: ${e.text}`;
    case 'vote':
      return e.targetId ? `${name(e.voterId)} → ${name(e.targetId)}` : `${name(e.voterId)} abstained`;
    case 'elimination':
      return `${name(e.playerId)} ${CAUSE_VERB[e.cause]} — they were a ${roleLabel(e.role)}`;
    case 'runoff':
      return `Runoff between ${e.candidates.map(name).join(', ')}`;
    case 'no-elimination':
      return NO_ELIM_REASON[e.reason];
    case 'phase-change':
      return e.phase === 'night' ? 'Night falls' : e.phase === 'day-debate' ? 'Day breaks' : e.phase;
  }
}
