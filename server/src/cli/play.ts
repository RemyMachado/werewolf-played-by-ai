import { createGame } from '../game/state';
import { runGame } from '../game/orchestrator';
import { GameConfig } from '../types/game';
import { Rng, seededRng } from '../game/rng';
import { GodModeController } from './god-controller';
import { Prompter } from './prompt';
import { makeSay } from './narrator';
import { renderOutcome, renderRecentLog } from './render';
import { bold } from './style';

// God-mode hotseat: you control every player and see all hidden info. A harness
// for hand-testing the engine, not the real game. Pass --seed=<n> to make role
// assignment and tie-breaks reproducible.
const config: GameConfig = {
  players: [
    { id: 'p1', name: 'Alice', isHuman: false },
    { id: 'p2', name: 'Bob', isHuman: false },
    { id: 'p3', name: 'Charlie', isHuman: false },
    { id: 'p4', name: 'Diana', isHuman: false },
    { id: 'p5', name: 'Eve', isHuman: false },
  ],
  werewolfCount: 1,
};

function parseSeed(argv: string[]): Rng {
  const arg = argv.find((a) => a.startsWith('--seed='));
  if (!arg) return Math.random;
  const seed = Number(arg.slice('--seed='.length));
  if (!Number.isFinite(seed)) throw new Error(`Invalid --seed value: ${arg}`);
  return seededRng(seed);
}

async function main(): Promise<void> {
  const rng = parseSeed(process.argv);
  const prompter = new Prompter();
  try {
    const initial = createGame(config, rng);
    const say = makeSay((s) => prompter.print(s), initial.players, true);
    const final = await runGame(initial, new GodModeController(prompter, say));

    say(renderOutcome(final));
    say('\n' + bold('Full log:'));
    say(renderRecentLog(final, final.log.length, true)); // god mode reveals all roles
  } finally {
    prompter.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
