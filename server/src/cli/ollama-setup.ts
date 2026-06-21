import { OllamaClient } from '../ollama/client';

// Connects to Ollama and verifies the model is pulled, so callers fail fast with
// clear guidance instead of silently running a broken game. Throws on failure.
export async function connectOllama(baseUrl: string, model: string, numCtx?: number): Promise<OllamaClient> {
  const client = new OllamaClient({ baseUrl, model, numCtx });

  let models: string[];
  try {
    models = await client.listModels();
  } catch {
    throw new Error(`Cannot reach Ollama at ${baseUrl}. Is it running? (curl ${baseUrl}/api/tags)`);
  }

  if (!models.includes(model)) {
    throw new Error(
      `Model "${model}" is not pulled. Available: ${models.join(', ') || '(none)'}\nPull it with:  ollama pull ${model}`,
    );
  }
  return client;
}
