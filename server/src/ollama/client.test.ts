import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OllamaClient } from './client';

// Builds a fake `fetch` that returns each queued assistant `content` string in
// turn (as a successful /api/chat response). Lets us simulate empty/malformed
// completions without a real Ollama server.
function fakeFetch(contents: string[]): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const content = contents[Math.min(call++, contents.length - 1)];
    return {
      ok: true,
      json: async () => ({ message: { role: 'assistant', content } }),
    } as Response;
  }) as unknown as typeof fetch;
}

const Schema = z.object({ choice: z.string() });

function client(): OllamaClient {
  return new OllamaClient({ baseUrl: 'http://localhost:11434', model: 'test-model' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaClient.chat', () => {
  it('parses and validates a valid JSON completion', async () => {
    vi.stubGlobal('fetch', fakeFetch([JSON.stringify({ choice: 'Alice' })]));
    expect(await client().chat([], Schema, 'json')).toEqual({ choice: 'Alice' });
  });

  it('re-asks when the model returns an empty response, then succeeds', async () => {
    const fetchMock = fakeFetch(['', '   ', JSON.stringify({ choice: 'Bob' })]);
    vi.stubGlobal('fetch', fetchMock);
    expect(await client().chat([], Schema, 'json')).toEqual({ choice: 'Bob' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('re-asks on malformed JSON, then succeeds', async () => {
    vi.stubGlobal('fetch', fakeFetch(['not json at all', JSON.stringify({ choice: 'Cara' })]));
    expect(await client().chat([], Schema, 'json')).toEqual({ choice: 'Cara' });
  });

  it('on repeated EMPTY responses, blames context window (--ctx) and names the model', async () => {
    vi.stubGlobal('fetch', fakeFetch(['']));
    await expect(client().chat([], Schema, 'json')).rejects.toThrow(/test-model/);
    await expect(client().chat([], Schema, 'json')).rejects.toThrow(/--ctx/);
  });

  it('on repeated MALFORMED responses, blames structured-output support and shows the output', async () => {
    vi.stubGlobal('fetch', fakeFetch(['definitely not json']));
    await expect(client().chat([], Schema, 'json')).rejects.toThrow(/structured output/);
    await expect(client().chat([], Schema, 'json')).rejects.toThrow(/Last output was/);
  });

  it('does not retry an HTTP failure — it throws immediately', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' }) as Response);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    await expect(client().chat([], Schema, 'json')).rejects.toThrow(/request failed: 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
