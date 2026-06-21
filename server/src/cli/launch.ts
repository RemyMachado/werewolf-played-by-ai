import { createGame } from '../game/state';
import { runGame } from '../game/orchestrator';
import { GameConfig } from '../types/game';
import { PRESETS, buildPlayers } from '../game/presets';
import { RoutingController } from '../game/routing-controller';
import { NpcController } from '../npc/npc-controller';
import { TestingController } from './testing-controller';
import { HumanController } from './human-controller';
import { Prompter } from './prompt';
import { makeSay } from './narrator';
import { connectOllama } from './ollama-setup';
import { createLogObserver, createThoughtObserver } from './observers';
import { renderOutcome, renderRoles } from './render';
import { bold, dim } from './style';

// Interactive launcher: pick a mode and a player-count preset, then play.
// Flags: --model=<name> (default gemma4:e4b), --base=<url>.
type Mode = 'human' | 'watch' | 'testing';

function argValue(flag: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

// The NPCs refer to the player by name, so it must be a real, distinct name —
// "You" reads as the pronoun and confuses them. Re-prompt until one is given.
const RESERVED_NAMES = new Set(['you', 'abstain', 'undecided', 'me', 'myself']);

async function askHumanName(prompter: Prompter): Promise<string> {
  for (;;) {
    const name = await prompter.text('Enter your name (the other players will refer to you by it):');
    if (name.length > 0 && !RESERVED_NAMES.has(name.toLowerCase())) return name;
    prompter.print('Please enter a real name — not blank, and not a word like "you".');
  }
}

async function main(): Promise<void> {
  const baseUrl = argValue('--base') ?? 'http://localhost:11434';
  const model = argValue('--model') ?? 'gemma4:e4b';
  const numCtx = argValue('--ctx') ? Number(argValue('--ctx')) : undefined;
  const wolfTalkRounds = argValue('--wolf-talk-rounds') ? Number(argValue('--wolf-talk-rounds')) : undefined;
  const debateRounds = argValue('--debate-rounds') ? Number(argValue('--debate-rounds')) : undefined;
  const prompter = new Prompter();

  try {
    const mode = await prompter.select<Mode>('Choose a game mode:', [
      { label: 'Play against the NPCs', value: 'human' },
      { label: 'Watch the NPCs play each other', value: 'watch' },
      { label: 'Testing mode — control every player yourself', value: 'testing' },
    ]);

    const preset = await prompter.select(
      'How many players?',
      PRESETS.map((p) => ({ label: p.label, value: p })),
    );

    const humanName = mode === 'human' ? await askHumanName(prompter) : null;
    const config: GameConfig = {
      players: buildPlayers(preset.players, humanName),
      werewolfCount: preset.werewolves,
      includeWitch: preset.witch,
    };
    const state = createGame(config);

    const print = (s: string) => prompter.print(s);

    // Testing mode needs no model and prints its own context, so no observer.
    if (mode === 'testing') {
      const say = makeSay(print, state.players, true);
      const final = await runGame(state, new TestingController(prompter, say), { wolfTalkRounds, debateRounds });
      say(renderOutcome(final));
      return;
    }

    const client = await connectOllama(baseUrl, model, numCtx);

    if (mode === 'watch') {
      const say = makeSay(print, state.players, true);
      say('\n' + bold('Roles (hidden from the NPCs):'));
      say(renderRoles(state));
      say(dim(`\nModel: ${model}`));
      // Watch/eval: surface each NPC's private reasoning as a dim [private] note.
      const npc = new NpcController(client, { onThought: createThoughtObserver(say) });
      const final = await runGame(state, npc, { observe: createLogObserver(say, true), wolfTalkRounds, debateRounds });
      say(renderOutcome(final));
    } else {
      // human vs NPCs: route the human seat to the human controller, the rest to
      // the NPCs. reveal is OFF, so names are never role-colored for the human, and
      // no onThought — the NPCs' private reasoning must not leak.
      const say = makeSay(print, state.players, false);
      const controller = new RoutingController(new HumanController(prompter, say), new NpcController(client));
      const final = await runGame(state, controller, { observe: createLogObserver(say, false), wolfTalkRounds, debateRounds });
      say(renderOutcome(final));
    }
  } finally {
    prompter.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
