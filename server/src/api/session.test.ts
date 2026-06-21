import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ChatMessage, LlmClient, OllamaFormat } from '../ollama/client';
import { buildPlayers } from '../game/presets';
import { seededRng } from '../game/rng';
import { GameConfig } from '../types/game';
import { ServerEvent } from './protocol';
import { GameSession } from './session';

// NPC fake honouring `format` like grammar-constrained decoding: enum fields get the
// first legal value, free-text fields a placeholder — a valid object for any shape.
// (Same approach as npc-controller.test.ts's ConstrainedFake.)
class ConstrainedFake implements LlmClient {
  async chat<T>(_messages: ChatMessage[], schema: z.ZodType<T>, format: OllamaFormat): Promise<T> {
    const props = (format as { properties: Record<string, { enum?: string[] }> }).properties;
    const obj: Record<string, string> = {};
    for (const [key, spec] of Object.entries(props)) obj[key] = spec.enum ? spec.enum[0] : `auto ${key}`;
    return schema.parse(obj);
  }
}

class ThrowingFake implements LlmClient {
  async chat<T>(): Promise<T> {
    throw new Error('ollama exploded');
  }
}

const config = (): GameConfig => ({ players: buildPlayers(5, 'You'), werewolfCount: 1 });

// The first legal answer for a prompt — mirrors the headless test-client.
function autoAnswer(prompt: Extract<ServerEvent, { type: 'prompt' }>['prompt']): string | null | boolean {
  if (prompt.kind === 'select') return prompt.choices[0].value;
  if (prompt.kind === 'text') return '';
  return false;
}

describe('GameSession', () => {
  it('drives a full game with a human seat to game-over, one prompt at a time', async () => {
    const events: ServerEvent[] = [];
    let session: GameSession;
    let awaiting = false; // tracks the single-pending-prompt invariant

    const terminal = await new Promise<ServerEvent>((resolve) => {
      const emit = (event: ServerEvent): void => {
        events.push(event);
        if (event.type === 'prompt') {
          expect(awaiting).toBe(false); // a new prompt must never arrive while one is unanswered
          awaiting = true;
          queueMicrotask(() => {
            awaiting = false; // answered before the loop can issue the next prompt
            session.submitAnswer(event.prompt.promptId, autoAnswer(event.prompt));
          });
        }
        if (event.type === 'game-over' || event.type === 'error') resolve(event);
      };
      session = new GameSession(config(), { client: new ConstrainedFake(), emit, rng: seededRng(2) });
    });

    expect(terminal.type).toBe('game-over');
    expect(events.some((e) => e.type === 'prompt')).toBe(true); // the human really was asked to act
    expect(events.some((e) => e.type === 'activity')).toBe(true); // live "who's acting" feedback fires

    // Night-role activity must never name who is acting (no hidden-role leak).
    const nightActivity = events.filter(
      (e): e is Extract<ServerEvent, { type: 'activity' }> =>
        e.type === 'activity' && /Seer|Witch|werewolves/.test(e.label),
    );
    for (const a of nightActivity) expect(a.actorId).toBeNull();
  });

  it('never leaks another player\'s hidden role in a view event', async () => {
    const views: Extract<ServerEvent, { type: 'view' }>[] = [];
    let session: GameSession;

    await new Promise<ServerEvent>((resolve) => {
      const emit = (event: ServerEvent): void => {
        if (event.type === 'view') views.push(event);
        if (event.type === 'prompt') queueMicrotask(() => session.submitAnswer(event.prompt.promptId, autoAnswer(event.prompt)));
        if (event.type === 'game-over' || event.type === 'error') resolve(event);
      };
      session = new GameSession(config(), { client: new ConstrainedFake(), emit, rng: seededRng(2) });
    });

    expect(views.length).toBeGreaterThan(0);
    for (const { view } of views) {
      // Living players are exposed by name only — their role must stay hidden.
      for (const p of view.alive) expect(p).not.toHaveProperty('role');
    }
  });

  it('rejects a stale promptId without resolving the prompt', async () => {
    let session: GameSession;
    let firstHandled = false;

    const terminal = await new Promise<ServerEvent>((resolve) => {
      const emit = (event: ServerEvent): void => {
        if (event.type === 'prompt') {
          queueMicrotask(() => {
            if (!firstHandled) {
              firstHandled = true;
              // A wrong id is refused with 409 and leaves the prompt pending...
              expect(session.submitAnswer('not-the-id', 'x')).toEqual({ ok: false, status: 409, message: expect.any(String) });
            }
            // ...the correct id then resolves it and the game proceeds.
            expect(session.submitAnswer(event.prompt.promptId, autoAnswer(event.prompt))).toEqual({ ok: true });
          });
        }
        if (event.type === 'game-over' || event.type === 'error') resolve(event);
      };
      session = new GameSession(config(), { client: new ConstrainedFake(), emit, rng: seededRng(2) });
    });

    expect(firstHandled).toBe(true);
    expect(terminal.type).toBe('game-over');
  });

  it('surfaces an LLM failure as an error event instead of crashing', async () => {
    let session: GameSession;
    const terminal = await new Promise<ServerEvent>((resolve) => {
      const emit = (event: ServerEvent): void => {
        if (event.type === 'prompt') queueMicrotask(() => session.submitAnswer(event.prompt.promptId, autoAnswer(event.prompt)));
        if (event.type === 'game-over' || event.type === 'error') resolve(event);
      };
      session = new GameSession(config(), { client: new ThrowingFake(), emit, rng: seededRng(2) });
    });

    expect(terminal.type).toBe('error');
    if (terminal.type === 'error') expect(terminal.message).toContain('ollama exploded');
  });

  it('replays the current log, view, and pending prompt to a late subscriber', async () => {
    let session!: GameSession;
    // Pause at the first prompt: don't answer, so we can inspect the replay snapshot.
    await new Promise<void>((resolve) => {
      const emit = (event: ServerEvent): void => {
        if (event.type === 'prompt') resolve();
      };
      session = new GameSession(config(), { client: new ConstrainedFake(), emit, rng: seededRng(2) });
    });

    const replay = session.replay();
    expect(replay.some((e) => e.type === 'view')).toBe(true);
    expect(replay.some((e) => e.type === 'prompt')).toBe(true);
  });
});
