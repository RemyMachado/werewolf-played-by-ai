// Headless end-to-end driver: plays the human seat through the HTTP/SSE API so a full
// game can be verified without a browser. It POSTs a new game, opens the SSE stream,
// prints every event, and auto-answers each prompt with the first legal choice. The
// NPCs are driven by the server's real Ollama, so the server must already be running
// (pnpm --filter server dev) with the model pulled.
//
//   pnpm --filter server web -- --players=5 --werewolves=1 --seed=1
//
// Flags: --server=<url> (default http://localhost:3000), --players, --werewolves,
// --witch, --name, --seed, --wolf-talk-rounds, --debate-rounds.

import { NewGameRequest, ServerEvent, ServerEventSchema, PromptDto } from './protocol';

function argValue(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// The first legal answer for a prompt: the first offered choice, an empty (quiet)
// speech, or "no" to a confirm.
function autoAnswer(prompt: PromptDto): string | null | boolean {
  switch (prompt.kind) {
    case 'select':
      return prompt.choices[0]?.value ?? null;
    case 'text':
      return '';
    case 'confirm':
      return false;
  }
}

function describe(event: ServerEvent): string {
  switch (event.type) {
    case 'log':
      return event.entries.map((e) => `  · ${JSON.stringify(e)}`).join('\n');
    case 'view':
      return `  view: round ${event.view.round}, alive ${event.view.alive.map((p) => p.name).join(', ')}` +
        ` (you are ${event.view.self.name}, ${event.view.self.role})`;
    case 'prompt':
      return `  ❓ ${event.prompt.kind}: ${event.prompt.question}`;
    case 'activity':
      return `  ⏳ ${event.label}`;
    case 'game-over':
      return `  🏁 game over — ${event.winner} win`;
    case 'error':
      return `  ❌ error: ${event.message}`;
  }
}

async function main(): Promise<void> {
  const server = argValue('--server') ?? 'http://localhost:3000';
  const players = Number(argValue('--players') ?? '5');
  const request: NewGameRequest = {
    players,
    werewolves: Number(argValue('--werewolves') ?? '1'),
    witch: hasFlag('--witch') ? true : hasFlag('--no-witch') ? false : players >= 8,
    humanName: argValue('--name') ?? 'You',
    seed: argValue('--seed') ? Number(argValue('--seed')) : undefined,
    wolfTalkRounds: argValue('--wolf-talk-rounds') ? Number(argValue('--wolf-talk-rounds')) : undefined,
    debateRounds: argValue('--debate-rounds') ? Number(argValue('--debate-rounds')) : undefined,
  };

  const created = await fetch(`${server}/api/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!created.ok) throw new Error(`POST /api/game failed: ${created.status} ${await created.text()}`);
  console.log(`Started game: ${players} players, ${request.werewolves} wolves, witch=${request.witch}`);

  const answer = async (prompt: PromptDto): Promise<void> => {
    const value = autoAnswer(prompt);
    const res = await fetch(`${server}/api/game/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptId: prompt.promptId, value }),
    });
    if (!res.ok) console.error(`  answer rejected: ${res.status} ${await res.text()}`);
  };

  const stream = await fetch(`${server}/api/game/stream`);
  if (!stream.body) throw new Error('stream has no body');
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; each data frame is a "data: ..." line.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue; // heartbeat comment or blank
      const event = ServerEventSchema.parse(JSON.parse(line.slice('data: '.length)));
      console.log(describe(event));
      if (event.type === 'prompt') await answer(event.prompt);
      if (event.type === 'game-over' || event.type === 'error') return;
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
