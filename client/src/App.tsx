import { useEffect, useMemo, useState } from 'react';
import { useGame } from './useGame';
import { useGameFx } from './useGameFx';
import { buildSeats } from './seats';
import { currentPhase, isNightPhase } from './format';
import { Backdrop } from './components/Backdrop';
import { Finale } from './components/Finale';
import { NewGameForm } from './components/NewGameForm';
import { Cockpit } from './components/Cockpit';
import { GameLog } from './components/GameLog';
import { Table } from './components/Table';
import { Stage } from './components/Stage';
import { ActionBar } from './components/ActionBar';
import { SidePanel } from './components/SidePanel';

const RAIL = 34; // collapsed-panel strip width

export default function App() {
  const { state, onStart, answer } = useGame();
  const fx = useGameFx(state);

  // Setup form vs. in-game header. The form shows before a game and after it ends;
  // during play the header collapses to an "Abandon game" button.
  const [showSetup, setShowSetup] = useState(true);
  const [finaleClosed, setFinaleClosed] = useState(false);
  useEffect(() => {
    if (state.status === 'game-over' || state.status === 'error' || state.status === 'idle') setShowSetup(true);
    if (state.status !== 'game-over') setFinaleClosed(false); // re-arm for the next game's finale
  }, [state.status]);

  // Collapsible/resizable side panels.
  const [left, setLeft] = useState({ open: true, w: 230 });
  const [right, setRight] = useState({ open: true, w: 300 });
  const cols = `${left.open ? left.w : RAIL}px 1fr ${right.open ? right.w : RAIL}px`;

  const seats = useMemo(() => buildSeats(state.view), [state.view]);
  const night = isNightPhase(state.log);
  const phase = currentPhase(state.log);

  const seatIds = useMemo(() => new Set(seats.map((s) => s.id)), [seats]);
  const prompt = state.prompt;
  const targetIds = useMemo(() => {
    if (prompt?.kind !== 'select') return new Set<string>();
    return new Set(prompt.choices.filter((c) => seatIds.has(c.value)).map((c) => c.value));
  }, [prompt, seatIds]);
  const extraChoices = prompt?.kind === 'select' ? prompt.choices.filter((c) => !seatIds.has(c.value)) : [];

  return (
    <div className={`app ${night ? 'is-night' : 'is-day'}`}>
      <Backdrop night={night} />

      <header>
        <h1>🐺 Werewolf</h1>
        <span className={`status ${state.connected ? 'on' : 'off'}`}>
          {state.connected ? 'connected' : 'connecting…'}
        </span>
        {showSetup ? (
          <NewGameForm
            onStart={(req) => {
              onStart(req);
              setShowSetup(false);
            }}
          />
        ) : (
          <button className="abandon" onClick={() => setShowSetup(true)}>
            Abandon game
          </button>
        )}
      </header>

      {state.status === 'error' && <div className="banner error">⚠ {state.error}</div>}

      <main className="layout" style={{ gridTemplateColumns: cols }}>
        <SidePanel
          side="left"
          panelClass="cockpit"
          title="Cockpit"
          open={left.open}
          width={left.w}
          onToggle={() => setLeft((s) => ({ ...s, open: !s.open }))}
          onResize={(w) => setLeft((s) => ({ ...s, w }))}
        >
          <Cockpit view={state.view} />
        </SidePanel>

        <section className="arena">
          {seats.length > 0 ? (
            <Table
              seats={seats}
              actingId={state.activity?.actorId ?? null}
              targetIds={targetIds}
              onSeatClick={(id) => answer(id)}
              speech={fx.speech}
              vote={fx.vote}
              center={
                <Stage
                  isNight={night}
                  round={state.view?.round ?? 0}
                  phase={phase}
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

        <SidePanel
          side="right"
          panelClass="history"
          title="History"
          open={right.open}
          width={right.w}
          onToggle={() => setRight((s) => ({ ...s, open: !s.open }))}
          onResize={(w) => setRight((s) => ({ ...s, w }))}
        >
          <GameLog log={state.log} view={state.view} />
        </SidePanel>
      </main>

      {state.status === 'game-over' && state.winner && state.roster && !finaleClosed && (
        <Finale winner={state.winner} roster={state.roster} onClose={() => setFinaleClosed(true)} />
      )}
    </div>
  );
}
