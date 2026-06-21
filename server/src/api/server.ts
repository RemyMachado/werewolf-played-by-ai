import express, { Response } from 'express';
import { GameConfig } from '../types/game';
import { buildPlayers } from '../game/presets';
import { seededRng } from '../game/rng';
import { LlmClient } from '../ollama/client';
import { ClientAnswerSchema, NewGameRequestSchema, ServerEvent } from './protocol';
import { GameSession, SessionDeps } from './session';

// SSE connections that sit idle (a human thinking) get dropped by intermediary
// proxies after ~30–60s without bytes. A periodic comment line keeps them alive.
const HEARTBEAT_MS = 15_000;

// Server-wide defaults for the per-game knobs, taken from CLI flags. A POST /api/game
// body may override them per game.
export type ServerDefaults = { wolfTalkRounds?: number; debateRounds?: number };

// Builds the Express app for the single-player game. The server owns the set of live
// SSE connections and the current session; the session emits ServerEvents through the
// server's broadcast sink, so connections survive a game restart (the new session
// simply emits to the same set). One game at a time — a new POST replaces the old.
export function createServer(client: LlmClient, defaults: ServerDefaults = {}): express.Express {
  const app = express();
  app.use(express.json());

  const connections = new Set<Response>();
  let session: GameSession | null = null;

  const send = (res: Response, event: ServerEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const broadcast = (event: ServerEvent): void => {
    for (const res of connections) send(res, event);
  };

  // A friendly landing response so hitting the root in a browser isn't a bare 404.
  // The actual game UI (Phase 5) is served separately by Vite in dev.
  app.get('/', (_req, res) => {
    res.json({
      service: 'werewolf-played-by-ai',
      endpoints: ['POST /api/game', 'GET /api/game/stream (SSE)', 'POST /api/game/answer', 'GET /api/game'],
      note: 'No browser UI yet (Phase 5). Drive a game with: pnpm --filter server web',
    });
  });

  // Start (or restart) the single game.
  app.post('/api/game', (req, res) => {
    const parsed = NewGameRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const r = parsed.data;

    const config: GameConfig = {
      players: buildPlayers(r.players, r.humanName),
      werewolfCount: r.werewolves,
      includeWitch: r.witch,
    };
    const deps: SessionDeps = {
      client,
      emit: broadcast,
      rng: r.seed !== undefined ? seededRng(r.seed) : undefined,
      wolfTalkRounds: r.wolfTalkRounds ?? defaults.wolfTalkRounds,
      debateRounds: r.debateRounds ?? defaults.debateRounds,
    };

    try {
      session?.abort(); // stop the old game affecting the stream before swapping it in
      session = new GameSession(config, deps);
    } catch (err) {
      // createGame validation (bad player/wolf counts, etc.) — a client error.
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    res.json({ ok: true });
  });

  // The event stream: subscribe, replay current state, heartbeat, clean up on close.
  app.get('/api/game/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // defeat proxy buffering of the stream
    res.flushHeaders();

    connections.add(res);
    if (session) for (const event of session.replay()) send(res, event);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      connections.delete(res);
    });
  });

  // The human's answer to the current prompt.
  app.post('/api/game/answer', (req, res) => {
    const parsed = ClientAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!session) {
      res.status(409).json({ error: 'no game in progress' });
      return;
    }
    const result = session.submitAnswer(parsed.data.promptId, parsed.data.value);
    if (result.ok) res.json({ ok: true });
    else res.status(result.status).json({ error: result.message });
  });

  // Non-streaming snapshot, handy for probes/tests.
  app.get('/api/game', (_req, res) => {
    if (!session) {
      res.status(409).json({ error: 'no game in progress' });
      return;
    }
    res.json({ events: session.replay() });
  });

  return app;
}
