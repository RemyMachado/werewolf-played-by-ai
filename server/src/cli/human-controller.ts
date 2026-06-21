import { GameState, Player } from '../types/game';
import { PlayerController } from '../game/controller';
import { buildPlayerView } from '../npc/view';
import { investigationTargets, nightKillTargets, poisonTargets, voteTargets } from '../game/targets';
import { ROLE_META } from '../game/roles';
import { Choice, Prompter } from './prompt';
import { Say } from './narrator';
import { renderHeader, renderPlayerView } from './render';

// Lets a human play one seat from the terminal. Shows ONLY that player's own view
// (role, private knowledge, who's alive) via buildPlayerView — never the all-revealing view. The
// running public commentary (NPC speeches, votes) is streamed separately by the
// game observer. Legal targets come from the shared helpers, so the human is
// offered exactly what the engine will accept. Output goes through `say` (whose
// reveal is OFF in human mode, so names are not role-colored).
export class HumanController implements PlayerController {
  constructor(
    private readonly prompter: Prompter,
    private readonly say: Say,
  ) {}

  private showCockpit(state: GameState, playerId: string): void {
    this.say('\n' + renderHeader(state));
    this.say(renderPlayerView(buildPlayerView(state, playerId)));
  }

  private toChoices(players: Player[]): Choice<string>[] {
    return players.map((p) => ({ label: p.name, value: p.id }));
  }

  async chooseNightTalk(state: GameState, wolf: Player): Promise<string> {
    this.showCockpit(state, wolf.id);
    const text = await this.prompter.text('NIGHT — say something to your pack (enter to stay quiet):');
    return text.length > 0 ? text : `${wolf.name} says nothing.`;
  }

  async chooseNightKill(state: GameState, werewolf: Player): Promise<string> {
    this.showCockpit(state, werewolf.id); // cockpit shows the pack's votes so far
    return this.prompter.select('NIGHT — cast your kill vote (yours is final):', this.toChoices(nightKillTargets(state)));
  }

  async chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    this.showCockpit(state, seer.id);
    const choice = await this.prompter.select(
      'NIGHT — investigate whom?',
      this.toChoices(investigationTargets(state, seer.id)),
    );
    const target = state.players.find((p) => p.id === choice)!;
    this.prompter.print(`  → ${target.name} is a ${ROLE_META[target.role].displayName}.`);
    return choice;
  }

  async chooseWitchHeal(state: GameState, witch: Player, victim: Player): Promise<boolean> {
    this.showCockpit(state, witch.id);
    const choice = await this.prompter.select(`NIGHT — ${victim.name} was attacked by the wolves. Use your healing potion?`, [
      { label: `Save ${victim.name}`, value: true },
      { label: '(let them die)', value: false },
    ]);
    return choice;
  }

  async chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    this.showCockpit(state, witch.id);
    const choices: Choice<string | null>[] = [
      ...this.toChoices(poisonTargets(state, witch.id)),
      { label: "(don't poison anyone)", value: null },
    ];
    return this.prompter.select('NIGHT — use your poison potion on whom?', choices);
  }

  async chooseSpeech(state: GameState, speaker: Player): Promise<string> {
    this.showCockpit(state, speaker.id);
    // Empty = stay silent (the engine treats an empty speech as a pass with no public line).
    return this.prompter.text('Your turn to speak (press enter to stay quiet):');
  }

  async chooseVote(state: GameState, voter: Player): Promise<string | null> {
    this.showCockpit(state, voter.id);
    const pd = state.phaseData;
    const prompt = pd.phase === 'day-vote' && pd.isRunoff ? 'RUNOFF — vote:' : 'VOTE — eliminate whom?';
    const choices: Choice<string | null>[] = [
      ...this.toChoices(voteTargets(state, voter.id)),
      { label: '(abstain)', value: null },
    ];
    return this.prompter.select(prompt, choices);
  }
}
