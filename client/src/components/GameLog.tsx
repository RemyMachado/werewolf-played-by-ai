import { useEffect, useRef } from 'react';
import { LogEntry, PlayerView } from '../types';
import { nameLookup, roleLabel, roleLookup } from '../format';

type Props = { log: LogEntry[]; view: PlayerView | null };

const CAUSE_VERB: Record<Extract<LogEntry, { type: 'elimination' }>['cause'], string> = {
  vote: 'was voted out',
  'night-kill': 'was killed in the night',
  poison: 'was poisoned',
};
const NO_ELIM: Record<Extract<LogEntry, { type: 'no-elimination' }>['reason'], string> = {
  'runoff-tie': 'The runoff tied — no one is voted out.',
  'all-abstained': 'Everyone abstained — no one is voted out.',
  'no-night-death': 'No one died during the night.',
};
const PHASE_LABEL: Record<string, string> = {
  night: 'Night falls',
  'day-debate': 'Day breaks',
  'day-vote': 'The vote',
  'game-over': 'Game over',
  lobby: 'Lobby',
};

// The public game history. Names are bold (and colour-coded once a role is known); the
// player currently quoted is underlined. The actual dialogue lives here — the board
// only flags who spoke.
export function GameLog({ log, view }: Props) {
  const name = nameLookup(view);
  const role = roleLookup(view);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  const Name = ({ id, speaking }: { id: string; speaking?: boolean }) => {
    const r = role(id);
    const cls = ['ln-name'];
    if (speaking) cls.push('speaking');
    if (r) cls.push(`role-${r}`);
    return <span className={cls.join(' ')}>{name(id)}</span>;
  };

  // All players (deduped), used to highlight names that appear inside spoken text.
  const players: { id: string; name: string }[] = [];
  if (view) {
    const seen = new Set<string>();
    for (const p of [view.self, ...view.alive, ...view.dead]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        players.push({ id: p.id, name: p.name });
      }
    }
  }
  const byName = new Map(players.map((p) => [p.name.toLowerCase(), p.id]));
  const namesByLen = players.map((p) => p.name).sort((a, b) => b.length - a.length);
  const nameRe = namesByLen.length
    ? new RegExp(`\\b(${namesByLen.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
    : null;

  // Splits spoken text and wraps any mentioned player name in a styled <Name>.
  const renderText = (text: string) => {
    if (!nameRe) return text;
    return text.split(nameRe).map((part, i) => {
      const id = byName.get(part.toLowerCase());
      return id ? <Name key={i} id={id} /> : part;
    });
  };

  const renderEntry = (e: LogEntry) => {
    switch (e.type) {
      case 'speech':
        return (
          <>
            <Name id={e.playerId} speaking />
            <span className="ln-colon">:</span> <span className="ln-text">{renderText(e.text)}</span>
          </>
        );
      case 'vote':
        return (
          <>
            <Name id={e.voterId} /> <span className="ln-arrow">→</span>{' '}
            {e.targetId ? <Name id={e.targetId} /> : <span className="muted">abstains</span>}
          </>
        );
      case 'elimination':
        return (
          <>
            <Name id={e.playerId} /> {CAUSE_VERB[e.cause]} — <span className={`role-tag role-${e.role}`}>{roleLabel(e.role)}</span>
          </>
        );
      case 'runoff':
        return (
          <>
            <span className="ln-label">Runoff:</span>{' '}
            {e.candidates.map((id, i) => (
              <span key={id}>
                {i > 0 ? ', ' : ''}
                <Name id={id} />
              </span>
            ))}
          </>
        );
      case 'no-elimination':
        return <span className="muted">{NO_ELIM[e.reason]}</span>;
      case 'phase-change':
        return null; // shown as a divider instead
    }
  };

  return (
    <div className="log">
      {log.length === 0 && <p className="muted">The story will appear here once a game begins.</p>}
      {log.map((e, i) =>
        e.type === 'phase-change' ? (
          <div key={i} className="divider">
            {PHASE_LABEL[e.phase] ?? e.phase}
            {e.round > 0 ? ` · round ${e.round}` : ''}
          </div>
        ) : (
          <div key={i} className={`entry ${e.type}`}>
            {renderEntry(e)}
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
