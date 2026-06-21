// Server entry point: connects to Ollama, then serves the single-player game API
// (SSE event stream + HTTP answers) that a browser client plays through.
//
//   pnpm --filter server dev   (or: tsx src/index.ts)
//
// Flags (same conventions as the CLI runners):
//   --model=<name>   Ollama model (default gemma4:e4b)
//   --base=<url>     Ollama base URL (default http://localhost:11434)
//   --ctx=<n>        context window override
//   --port=<n>       HTTP port (default 3000)
//   --wolf-talk-rounds=<n> / --debate-rounds=<n>   per-game defaults

import { connectOllama } from './cli/ollama-setup';
import { createServer } from './api/server';

function argValue(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

async function main(): Promise<void> {
  const baseUrl = argValue('--base') ?? 'http://localhost:11434';
  const model = argValue('--model') ?? 'gemma4:e4b';
  const numCtx = argValue('--ctx') ? Number(argValue('--ctx')) : undefined;
  const port = argValue('--port') ? Number(argValue('--port')) : 3000;
  const wolfTalkRounds = argValue('--wolf-talk-rounds') ? Number(argValue('--wolf-talk-rounds')) : undefined;
  const debateRounds = argValue('--debate-rounds') ? Number(argValue('--debate-rounds')) : undefined;

  // Fail fast with clear guidance if Ollama or the model is missing, before binding.
  const client = await connectOllama(baseUrl, model, numCtx);

  const app = createServer(client, { wolfTalkRounds, debateRounds });
  app.listen(port, () => {
    console.log(`Werewolf server listening on http://localhost:${port} (model: ${model})`);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
