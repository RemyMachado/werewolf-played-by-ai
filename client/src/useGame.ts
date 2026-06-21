import { useCallback, useEffect, useReducer } from 'react';
import { startGame, submitAnswer } from './api';
import { LogEntry, NewGameRequest, PlayerView, PromptDto, ServerEvent, Team } from './types';

export type Status = 'idle' | 'playing' | 'game-over' | 'error';

export type Activity = { label: string; actorId: string | null };

export type GameState = {
  connected: boolean;
  status: Status;
  log: LogEntry[];
  view: PlayerView | null;
  prompt: PromptDto | null;
  activity: Activity | null; // live "who is acting now", or null when it's the human's turn / idle
  winner: Team | null;
  error: string | null;
};

const EMPTY: GameState = {
  connected: false,
  status: 'idle',
  log: [],
  view: null,
  prompt: null,
  activity: null,
  winner: null,
  error: null,
};

type Action =
  | { type: 'open' } // (re)connected — clear and let the stream's replay rebuild
  | { type: 'closed' }
  | { type: 'reset' } // starting a new game from this tab
  | { type: 'answered' } // optimistically clear the prompt after sending an answer
  | { type: 'localError'; message: string }
  | { type: 'event'; event: ServerEvent };

// Folds the server's event stream into renderable state. Because the server pushes
// log DELTAS during play and a full snapshot on (re)subscribe, we clear on 'open' so
// the snapshot rebuilds cleanly instead of duplicating entries.
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'open':
      return { ...EMPTY, connected: true };
    case 'closed':
      return { ...state, connected: false };
    case 'reset':
      return { ...EMPTY, connected: state.connected, status: 'playing' };
    case 'answered':
      return { ...state, prompt: null };
    case 'localError':
      return { ...state, status: 'error', error: action.message };
    case 'event': {
      const e = action.event;
      switch (e.type) {
        case 'log':
          return { ...state, status: playing(state.status), log: [...state.log, ...e.entries] };
        case 'view':
          return { ...state, status: playing(state.status), view: e.view };
        case 'prompt':
          // The human's turn — clear any stale NPC activity so the stage shows "Your turn".
          return { ...state, status: playing(state.status), prompt: e.prompt, activity: null };
        case 'activity':
          return { ...state, status: playing(state.status), activity: { label: e.label, actorId: e.actorId } };
        case 'game-over':
          return { ...state, status: 'game-over', winner: e.winner, prompt: null, activity: null };
        case 'error':
          return { ...state, status: 'error', error: e.message, prompt: null, activity: null };
      }
    }
  }
}

const playing = (status: Status): Status => (status === 'idle' ? 'playing' : status);

// Owns the single SSE connection plus the actions a player can take. The connection
// is opened once and kept across games (the server broadcasts each game to it).
export function useGame() {
  const [state, dispatch] = useReducer(reducer, EMPTY);

  useEffect(() => {
    const es = new EventSource('/api/game/stream');
    es.onopen = () => dispatch({ type: 'open' });
    es.onmessage = (m) => {
      try {
        dispatch({ type: 'event', event: JSON.parse(m.data) as ServerEvent });
      } catch {
        // ignore non-JSON frames (heartbeats are comments and never reach onmessage)
      }
    };
    es.onerror = () => dispatch({ type: 'closed' });
    return () => es.close();
  }, []);

  const onStart = useCallback(async (req: NewGameRequest) => {
    dispatch({ type: 'reset' });
    try {
      await startGame(req);
    } catch (err) {
      dispatch({ type: 'localError', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const answer = useCallback(
    async (value: string | null | boolean) => {
      const prompt = state.prompt;
      if (!prompt) return;
      dispatch({ type: 'answered' }); // prevent a double-submit; next events refill
      try {
        await submitAnswer({ promptId: prompt.promptId, value });
      } catch (err) {
        dispatch({ type: 'localError', message: err instanceof Error ? err.message : String(err) });
      }
    },
    [state.prompt],
  );

  return { state, onStart, answer };
}
