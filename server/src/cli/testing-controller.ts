import { GameState, Player } from '../types/game';
import { PlayerController } from '../game/controller';
import { investigationTargets, nightKillTargets, poisonTargets, voteTargets } from '../game/targets';
import { Choice, Prompter } from './prompt';
import { Say } from './narrator';
import { renderHeader, renderRecentLog, renderRoster } from './render';

// A single CLI controller that answers for every player in "testing mode": it reveals
// all roles and hidden info. Built for hand-testing the engine, not real play —
// the real game routes each player to its own controller (human vs NPC).
// Uses `prompter` for input (menus/text) and `say` for output (colors names).
export class TestingController implements PlayerController {
  constructor(
    private readonly prompter: Prompter,
    private readonly say: Say,
  ) {}

  private showContext(state: GameState): void {
    this.say('\n' + renderHeader(state));
    this.say(renderRoster(state, true));
    const log = renderRecentLog(state, 12, true); // testing mode reveals all roles
    if (log) this.say('\n' + log);
  }

  private toChoices(players: Player[]): Choice<string>[] {
    return players.map((p) => ({ label: p.name, value: p.id }));
  }

  async chooseNightTalk(state: GameState, wolf: Player): Promise<string> {
    this.showContext(state);
    return this.prompter.text(`NIGHT — ${wolf.name} (werewolf), say something to the pack:`);
  }

  async chooseNightKill(state: GameState, werewolf: Player): Promise<string> {
    this.showContext(state);
    return this.prompter.select(
      `NIGHT — ${werewolf.name} (werewolf), vote for a victim:`,
      this.toChoices(nightKillTargets(state)),
    );
  }

  async chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    this.showContext(state);
    const choice = await this.prompter.select(
      `NIGHT — ${seer.name} (seer), choose someone to investigate:`,
      this.toChoices(investigationTargets(state, seer.id)),
    );
    const target = state.players.find((p) => p.id === choice)!;
    this.say(`  → ${target.name} is a ${target.role}.`);
    return choice;
  }

  async chooseWitchHeal(state: GameState, witch: Player, victim: Player): Promise<boolean> {
    this.showContext(state);
    return this.prompter.select(`NIGHT — ${witch.name} (witch), the wolves attacked ${victim.name}. Use the healing potion?`, [
      { label: `Save ${victim.name}`, value: true },
      { label: '(let them die)', value: false },
    ]);
  }

  async chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    this.showContext(state);
    const choices: Choice<string | null>[] = [
      ...this.toChoices(poisonTargets(state, witch.id)),
      { label: "(don't poison anyone)", value: null },
    ];
    return this.prompter.select(`NIGHT — ${witch.name} (witch), use the poison potion on whom?`, choices);
  }

  async chooseSpeech(state: GameState, speaker: Player): Promise<string> {
    this.showContext(state);
    // Empty = stay silent (the engine treats an empty speech as a pass with no public line).
    return this.prompter.text(`DAY — ${speaker.name}, say something (enter to skip):`);
  }

  async chooseVote(state: GameState, voter: Player): Promise<string | null> {
    this.showContext(state);
    const pd = state.phaseData;
    const prompt =
      pd.phase === 'day-vote' && pd.isRunoff
        ? `RUNOFF — ${voter.name}, vote among the tied players:`
        : `VOTE — ${voter.name}, who do you vote to eliminate?`;
    const choices: Choice<string | null>[] = [
      ...this.toChoices(voteTargets(state, voter.id)),
      { label: '(abstain)', value: null },
    ];
    return this.prompter.select(prompt, choices);
  }
}
