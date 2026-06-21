import { createGame } from '../game/state';
import { runGame } from '../game/orchestrator';
import { GameConfig } from '../types/game';
import { Rng, seededRng } from '../game/rng';
import { buildPlayers } from '../game/presets';
import { NpcController } from '../npc/npc-controller';
import { connectOllama } from './ollama-setup';
import { createLogObserver, createThoughtObserver } from './observers';
import { makeSay } from './narrator';
import { renderOutcome, renderRoles } from './render';
import { bold, dim } from './style';

// Watches an all-NPC game play out against a local Ollama model — the analog of
// testing mode, but every seat is the LLM. Flags: --seed=<n>, --model=<name>,
// --base=<url>, --players=<n>, --wolves=<n>, --witch / --no-witch (defaults on for
// 8+ players, the official threshold). For interactive setup use `launch`.
function argValue(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseSeed(): Rng {
  const raw = argValue('--seed');
  if (raw === undefined) return Math.random;
  const seed = Number(raw);
  if (!Number.isFinite(seed)) throw new Error(`Invalid --seed value: ${raw}`);
  return seededRng(seed);
}

async function main(): Promise<void> {
  const baseUrl = argValue('--base') ?? 'http://localhost:11434';
  const model = argValue('--model') ?? 'gemma4:e4b';
  const playerCount = Number(argValue('--players') ?? '5');
  const werewolfCount = Number(argValue('--wolves') ?? '1');
  // The Witch is an official 8+ player role; include it by default at that size,
  // but let --witch / --no-witch override for experimentation.
  const includeWitch = hasFlag('--no-witch') ? false : hasFlag('--witch') || playerCount >= 8;
  const numCtx = argValue('--ctx') ? Number(argValue('--ctx')) : undefined;
  const wolfTalkRounds = argValue('--wolf-talk-rounds') ? Number(argValue('--wolf-talk-rounds')) : undefined;
  const debateRounds = argValue('--debate-rounds') ? Number(argValue('--debate-rounds')) : undefined;
  const rng = parseSeed();

  const client = await connectOllama(baseUrl, model, numCtx);

  const config: GameConfig = { players: buildPlayers(playerCount, null), werewolfCount, includeWitch };
  const state = createGame(config, rng);

  const say = makeSay((s) => console.log(s), state.players, true);
  say(bold('Roles (hidden from the NPCs):'));
  say(renderRoles(state));
  say(dim(`\nModel: ${model}`));

  const npc = new NpcController(client, { onThought: createThoughtObserver(say) });
  const final = await runGame(state, npc, { observe: createLogObserver(say, true), wolfTalkRounds, debateRounds });
  say(renderOutcome(final));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
