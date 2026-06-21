import { useEffect, useRef } from 'react';
import { LogEntry, PlayerView } from '../types';
import { formatLogEntry, nameLookup } from '../format';

type Props = { log: LogEntry[]; view: PlayerView | null };

// The public game history, newest at the bottom, auto-scrolled. Phase changes render
// as dividers; everything else as a single readable line.
export function GameLog({ log, view }: Props) {
  const name = nameLookup(view);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <aside className="history">
      <h3>History</h3>
      <div className="log">
      {log.length === 0 && <p className="muted">The story will appear here once a game begins.</p>}
      {log.map((e, i) =>
        e.type === 'phase-change' ? (
          <div key={i} className="divider">
            {formatLogEntry(e, name)}
          </div>
        ) : (
          <div key={i} className={`entry ${e.type}`}>
            {formatLogEntry(e, name)}
          </div>
        ),
      )}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
