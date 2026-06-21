import { z } from 'zod';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OllamaClientConfig = {
  baseUrl: string;
  model: string;
  numCtx?: number; // context window; Ollama defaults to ~2048 unless set
};

// Must hold a whole game: the (sizeable) system prompt + a transcript (capped at 60
// entries) + memory. That total is BOUNDED — even a 12-player game sits well under
// ~8K tokens — so we don't need (and shouldn't request) a model's full 128K context:
// Ollama allocates KV cache for whatever num_ctx is set, so an "absurd" value just
// wastes VRAM / offloads for no benefit. 16384 is a generous fixed margin that never
// overflows a game yet stays VRAM-friendly, and it is below the context limit of every
// recommended model (gemma4:e4b, phi4, qwen2.5 all support >=32K) so it is never
// clamped or quality-degraded. Override with --ctx if a model needs less (lower it for
// a big 14B on a small GPU) or a game somehow needs more.
const DEFAULT_NUM_CTX = 16384;

// Smaller models occasionally return an empty or malformed completion even under
// grammar-constrained output. Rather than crash the whole game on a transient
// hiccup, re-ask the SAME prompt a few times (this is not fabricating an answer —
// it just gives the model another chance to respond validly). Only if every
// attempt fails do we throw, with a clear message.
const MAX_ATTEMPTS = 3;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// An Ollama structured-output schema (JSON Schema) passed in the `format` field to
// constrain generation. `'json'` asks only for valid JSON without a shape.
export type OllamaFormat = Record<string, unknown> | 'json';

// The capability the NPC layer depends on. Depending on this interface (rather
// than OllamaClient directly) lets tests inject a fake LLM with canned output.
// `format` constrains generation; `schema` validates the parsed result in TS.
export interface LlmClient {
  chat<T>(messages: ChatMessage[], schema: z.ZodType<T>, format: OllamaFormat): Promise<T>;
}

// Internal shape of a non-streaming Ollama /api/chat response.
const OllamaChatResponseSchema = z.object({
  message: z.object({
    role: z.literal('assistant'),
    content: z.string(),
  }),
});

const OllamaTagsSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export class OllamaClient implements LlmClient {
  private readonly config: OllamaClientConfig;

  constructor(config: OllamaClientConfig) {
    this.config = config;
  }

  // Sends messages to Ollama with structured output constrained by `format`,
  // parses the response content as JSON, and validates it against `schema`.
  // An HTTP failure throws immediately (it is a config/connectivity problem that a
  // retry won't fix). An empty, non-JSON, or wrong-shaped completion is re-asked up
  // to MAX_ATTEMPTS times; if none succeeds, it throws with the model name and the
  // last error so the failure is understandable instead of a bare JSON crash.
  async chat<T>(messages: ChatMessage[], schema: z.ZodType<T>, format: OllamaFormat): Promise<T> {
    let lastError: unknown;
    let lastRaw = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const content = (await this.requestContent(messages, format)).trim();
      lastRaw = content;
      if (!content) {
        lastError = new Error('the model returned an empty response');
        continue;
      }
      try {
        return schema.parse(JSON.parse(content));
      } catch (err) {
        lastError = err; // malformed JSON or wrong shape — give the model another try
      }
    }
    // Two distinct failure modes after exhausting retries:
    if (!lastRaw) {
      // Empty every time — most often the prompt outgrew the context window (Ollama
      // truncates and the model returns nothing), which happens deeper into a game;
      // less often the model just doesn't support structured output.
      throw new Error(
        `Ollama model "${this.config.model}" returned an empty response on all ${MAX_ATTEMPTS} attempts. ` +
          `Most often this means the prompt outgrew the context window (raise it with --ctx, e.g. --ctx=16384) — ` +
          `this tends to happen later in a game as the history grows. It can also mean the model does not support ` +
          `Ollama's structured output; if so use gemma4:e4b, phi4, or qwen2.5.`,
      );
    }
    // Non-empty but unparseable — the model isn't honoring the JSON grammar (notably
    // reasoning models like qwen3.5 / deepseek-r1, see ollama/ollama#15260).
    throw new Error(
      `Ollama model "${this.config.model}" did not return valid JSON after ${MAX_ATTEMPTS} attempts: ${errorMessage(lastError)}. ` +
        `This usually means the model does not support Ollama's structured output — common with reasoning models such as qwen3.5 and deepseek-r1. ` +
        `Use a format-friendly model instead, e.g. gemma4:e4b, phi4, or qwen2.5. Last output was: ${JSON.stringify(lastRaw.slice(0, 200))}`,
    );
  }

  // One /api/chat round-trip → the assistant's content string. Throws on an HTTP error
  // (not retried — that is a config/connectivity problem a retry won't fix).
  private async requestContent(messages: ChatMessage[], format: OllamaFormat): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        format,
        stream: false,
        options: { num_ctx: this.config.numCtx ?? DEFAULT_NUM_CTX },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    return OllamaChatResponseSchema.parse(await response.json()).message.content;
  }

  // Lists the locally available model names (Ollama /api/tags). Used for preflight
  // checks so callers can fail fast with clear guidance if a model isn't pulled.
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }
    const { models } = OllamaTagsSchema.parse(await response.json());
    return models.map((m) => m.name);
  }
}
