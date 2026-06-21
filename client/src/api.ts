import { ClientAnswer, NewGameRequest } from './types';

// Thin POST helpers. The SSE stream (opened in useGame) carries everything the
// server pushes; these are the only two things the client sends back. Vite proxies
// /api to the game server (see vite.config.ts).
async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `${res.status} ${res.statusText}`);
  }
}

export const startGame = (req: NewGameRequest): Promise<void> => postJson('/api/game', req);
export const submitAnswer = (answer: ClientAnswer): Promise<void> => postJson('/api/game/answer', answer);
