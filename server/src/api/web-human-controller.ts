import { GameState, Player } from '../types/game';
import { PlayerController } from '../game/controller';
import { investigationTargets, nightKillTargets, poisonTargets, voteTargets } from '../game/targets';
import { PromptChoice, PromptDto } from './protocol';

// Sentinels for the non-player options of a select prompt. Player ids are "p1", "p2",
// … so these can never collide with a real target.
const ABSTAIN = 'abstain';
const NO_POISON = 'no-poison';

// Issues a prompt to the human and resolves with their answer. Supplied by the
// GameSession; kept narrow (not the whole session) so this controller is trivially
// unit-testable in isolation.
export type RequestPrompt = (dto: PromptDto) => Promise<string | null | boolean>;

// The human seat as a PlayerController. Where the CLI HumanController prints an ANSI
// cockpit and blocks on readline, this emits a structured PromptDto and awaits the
// answer the session feeds back from an HTTP POST. It reuses the same legal-move
// helpers as every other controller, so the human is offered exactly what the engine
// will accept. It deliberately does NOT implement reflect / reflectOnInvestigation:
// those are private NPC memory hooks, and a human has nothing to answer for them
// (implementing them would park the game waiting on a prompt the UI never shows).
export class WebHumanController implements PlayerController {
  private nextPromptId = 0;

  constructor(private readonly requestPrompt: RequestPrompt) {}

  private id(): string {
    return `prompt-${this.nextPromptId++}`;
  }

  private toChoices(players: Player[]): PromptChoice[] {
    return players.map((p) => ({ label: p.name, value: p.id }));
  }

  // The session validates a select answer against the offered choices before
  // resolving, so a resolved value is always one of the choice values (a string).
  private async select(question: string, choices: PromptChoice[]): Promise<string> {
    const answer = await this.requestPrompt({ kind: 'select', promptId: this.id(), question, choices });
    if (typeof answer !== 'string') throw new Error('expected a string answer for a select prompt');
    return answer;
  }

  private async text(question: string): Promise<string> {
    const answer = await this.requestPrompt({ kind: 'text', promptId: this.id(), question });
    return typeof answer === 'string' ? answer.trim() : '';
  }

  private async confirm(question: string, confirmLabel: string, denyLabel: string): Promise<boolean> {
    const answer = await this.requestPrompt({ kind: 'confirm', promptId: this.id(), question, confirmLabel, denyLabel });
    return answer === true;
  }

  async chooseNightTalk(_state: GameState, wolf: Player): Promise<string> {
    const text = await this.text('Night — say something to your pack (leave empty to stay quiet):');
    // Mirror the CLI: an empty pack message reads as a brief "says nothing" line
    // rather than throwing (the engine only rejects empty NPC wolf-talk).
    return text.length > 0 ? text : `${wolf.name} says nothing.`;
  }

  async chooseNightKill(state: GameState, _werewolf: Player): Promise<string> {
    return this.select("Night — choose the pack's victim:", this.toChoices(nightKillTargets(state)));
  }

  async chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    // Pick only — the engine reveals the result, which arrives in the next view push.
    return this.select('Night — investigate whom?', this.toChoices(investigationTargets(state, seer.id)));
  }

  async chooseWitchHeal(_state: GameState, _witch: Player, victim: Player): Promise<boolean> {
    return this.confirm(
      `Night — the wolves attacked ${victim.name}. Use your healing potion?`,
      `Save ${victim.name}`,
      'Let them die',
    );
  }

  async chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    const choices: PromptChoice[] = [
      ...this.toChoices(poisonTargets(state, witch.id)),
      { label: "Don't poison anyone", value: NO_POISON },
    ];
    const answer = await this.select('Night — use your poison potion on whom?', choices);
    return answer === NO_POISON ? null : answer;
  }

  async chooseSpeech(_state: GameState, _speaker: Player): Promise<string> {
    // Empty = a silent pass; the engine records no speech for it.
    return this.text('Your turn to speak (leave empty to stay quiet):');
  }

  async chooseVote(state: GameState, voter: Player): Promise<string | null> {
    const pd = state.phaseData;
    const runoff = pd.phase === 'day-vote' && pd.isRunoff;
    const choices: PromptChoice[] = [
      ...this.toChoices(voteTargets(state, voter.id)),
      { label: 'Abstain', value: ABSTAIN },
    ];
    const answer = await this.select(runoff ? 'Runoff — vote:' : 'Vote — eliminate whom?', choices);
    return answer === ABSTAIN ? null : answer;
  }
}
