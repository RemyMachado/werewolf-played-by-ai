import { useMemo } from 'react';
import { useGame } from './useGame';
import { buildSeats } from './seats';
import { isNightPhase } from './format';
import { NewGameForm } from './components/NewGameForm';
import { Cockpit } from './components/Cockpit';
import { GameLog } from './components/GameLog';
import { Table } from './components/Table';
import { Stage } from './components/Stage';
import { ActionBar } from './components/ActionBar';

export default function App() {
  const { state, onStart, answer } = useGame();

  const seats = useMemo(() => buildSeats(state.view), [state.view]);
  const night = isNightPhase(state.log);

  // Split the current select-prompt's choices into seats (clicked at the table) and
  // extras (abstain / don't-poison, shown as buttons).
  const seatIds = useMemo(() => new Set(seats.map((s) => s.id)), [seats]);
  const prompt = state.prompt;
  const targetIds = useMemo(() => {
    if (prompt?.kind !== 'select') return new Set<string>();
    return new Set(prompt.choices.filter((c) => seatIds.has(c.value)).map((c) => c.value));
  }, [prompt, seatIds]);
  const extraChoices = prompt?.kind === 'select' ? prompt.choices.filter((c) => !seatIds.has(c.value)) : [];

  return (
    <div className={`app ${night ? 'is-night' : 'is-day'}`}>
      <header>
        <h1>🐺 Werewolf</h1>
        <span className={`status ${state.connected ? 'on' : 'off'}`}>
          {state.connected ? 'connected' : 'connecting…'}
        </span>
        <NewGameForm onStart={onStart} busy={state.status === 'playing'} />
      </header>

      {state.status === 'error' && <div className="banner error">⚠ {state.error}</div>}
      {state.status === 'game-over' && <div className="banner over">🏁 The {state.winner} win!</div>}

      <main className="layout">
        <Cockpit view={state.view} />

        <section className="arena">
          {seats.length > 0 ? (
            <Table
              seats={seats}
              actingId={state.activity?.actorId ?? null}
              targetIds={targetIds}
              onSeatClick={(id) => answer(id)}
              center={
                <Stage
                  isNight={night}
                  round={state.view?.round ?? 0}
                  activity={state.activity?.label ?? null}
                  yourTurn={!!prompt}
                />
              }
            />
          ) : (
            <div className="empty-arena">Start a game to take your seat at the table.</div>
          )}
          {prompt && (
            <ActionBar
              prompt={prompt}
              extraChoices={extraChoices}
              hasSeatTargets={targetIds.size > 0}
              onAnswer={answer}
            />
          )}
        </section>

        <GameLog log={state.log} view={state.view} />
      </main>
    </div>
  );
}
