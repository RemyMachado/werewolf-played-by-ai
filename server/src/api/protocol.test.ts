import { describe, expect, it } from 'vitest';
import {
  ClientAnswerSchema,
  PromptDtoSchema,
  ServerEventSchema,
  validateAnswer,
  type PromptDto,
} from './protocol';

describe('protocol schemas', () => {
  it('parses each prompt kind', () => {
    expect(PromptDtoSchema.parse({ kind: 'select', promptId: 'p0', question: 'who?', choices: [{ label: 'A', value: 'a' }] }).kind).toBe('select');
    expect(PromptDtoSchema.parse({ kind: 'text', promptId: 'p1', question: 'say:' }).kind).toBe('text');
    expect(PromptDtoSchema.parse({ kind: 'confirm', promptId: 'p2', question: 'heal?', confirmLabel: 'yes', denyLabel: 'no' }).kind).toBe('confirm');
  });

  it('rejects an unknown prompt kind', () => {
    expect(PromptDtoSchema.safeParse({ kind: 'slider', promptId: 'p', question: 'q' }).success).toBe(false);
  });

  it('parses each server event type', () => {
    expect(ServerEventSchema.parse({ type: 'log', entries: [] }).type).toBe('log');
    expect(ServerEventSchema.parse({ type: 'prompt', prompt: { kind: 'text', promptId: 'p', question: 'q' } }).type).toBe('prompt');
    expect(ServerEventSchema.parse({ type: 'activity', label: 'X is speaking…', actorId: 'p2' }).type).toBe('activity');
    expect(ServerEventSchema.parse({ type: 'activity', label: 'The Seer acts', actorId: null }).type).toBe('activity');
    expect(
      ServerEventSchema.parse({
        type: 'game-over',
        winner: 'villagers',
        roster: [{ id: 'p1', name: 'Alice', role: 'seer' }],
      }).type,
    ).toBe('game-over');
    expect(ServerEventSchema.parse({ type: 'error', message: 'boom' }).type).toBe('error');
  });

  it('rejects an unknown server event type', () => {
    expect(ServerEventSchema.safeParse({ type: 'whoops' }).success).toBe(false);
  });

  it('accepts string, null, and boolean client-answer values', () => {
    expect(ClientAnswerSchema.parse({ promptId: 'p', value: 'p3' }).value).toBe('p3');
    expect(ClientAnswerSchema.parse({ promptId: 'p', value: null }).value).toBeNull();
    expect(ClientAnswerSchema.parse({ promptId: 'p', value: true }).value).toBe(true);
  });
});

describe('validateAnswer', () => {
  const select: PromptDto = { kind: 'select', promptId: 'p', question: 'who?', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] };
  const text: PromptDto = { kind: 'text', promptId: 'p', question: 'say:' };
  const confirm: PromptDto = { kind: 'confirm', promptId: 'p', question: 'heal?', confirmLabel: 'yes', denyLabel: 'no' };

  it('accepts an offered select choice and rejects others', () => {
    expect(validateAnswer(select, 'b')).toEqual({ ok: true, value: 'b' });
    expect(validateAnswer(select, 'z').ok).toBe(false);
    expect(validateAnswer(select, true).ok).toBe(false);
  });

  it('accepts any string (including empty) for text', () => {
    expect(validateAnswer(text, '')).toEqual({ ok: true, value: '' });
    expect(validateAnswer(text, 'hello')).toEqual({ ok: true, value: 'hello' });
    expect(validateAnswer(text, 5).ok).toBe(false);
  });

  it('accepts only a boolean for confirm', () => {
    expect(validateAnswer(confirm, true)).toEqual({ ok: true, value: true });
    expect(validateAnswer(confirm, false)).toEqual({ ok: true, value: false });
    expect(validateAnswer(confirm, 'yes').ok).toBe(false);
  });
});
