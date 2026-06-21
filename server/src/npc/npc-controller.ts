import { GameState, Player, Role } from '../types/game';
import { PlayerController } from '../game/controller';
import { ROLE_META } from '../game/roles';
import { ChatMessage, LlmClient } from '../ollama/client';
import { Rng, shuffle } from '../game/rng';
import { investigationTargets, nightKillTargets, poisonTargets, voteTargets } from '../game/targets';
import { buildPlayerView, PlayerView } from './view';
import { matchOption } from './resolve';
import {
  HealSchema,
  ReactionSchema,
  ReflectionSchema,
  SpeechSchema,
  TalkSchema,
  TargetSchema,
  VoteSchema,
  healFormat,
  reactionFormat,
  reflectionFormat,
  speechFormat,
  talkFormat,
  targetFormat,
  voteFormat,
} from './schemas';
import {
  investigationPrompt,
  investigationResultPrompt,
  nightKillPrompt,
  nightTalkPrompt,
  reflectionPrompt,
  speechPrompt,
  systemPrompt,
  votePrompt,
  witchHealPrompt,
  witchPoisonPrompt,
} from './prompts';

const MAX_SPEECH_LENGTH = 500;
const ABSTAIN = 'abstain';
const NONE = 'none';

// Called after each NPC turn with that player's private thoughts — for watch/eval
// observability. Never wired up in human play, so it can't leak to the human.
// Carries the role (to tag the turn with a role emoji) and the memory note the
// player chose to keep, alongside their reasoning.
export type NpcObserver = (event: {
  player: string;
  role: Role;
  reasoning: string;
  memory?: string; // absent on a turn that doesn't update memory (e.g. the seer's pick)
  note?: string;
}) => void;

export type NpcControllerOptions = {
  rng?: Rng; // only shuffles option presentation order (to defeat first-slot bias)
  onThought?: NpcObserver;
};

// An LLM-backed player. One NpcController drives every NPC seat. Each decision goes
// through buildPlayerView (hidden-info boundary) and returns private_reasoning +
// memory_update alongside a grammar-constrained action. The memory is kept here, per
// player, and fed back into that player's later prompts so its strategy persists.
// An invalid action throws rather than being guessed — a random substitute would
// silently bias the game.
export class NpcController implements PlayerController {
  private readonly client: LlmClient;
  private readonly rng: Rng;
  private readonly onThought?: NpcObserver;
  private readonly memory = new Map<string, string>(); // playerId -> private notes

  constructor(client: LlmClient, options: NpcControllerOptions = {}) {
    this.client = client;
    this.rng = options.rng ?? Math.random;
    this.onThought = options.onThought;
  }

  async chooseNightTalk(state: GameState, wolf: Player): Promise<string> {
    const view = buildPlayerView(state, wolf.id);
    const out = await this.client.chat(
      this.messages(view, nightTalkPrompt(view, this.notes(wolf.id))),
      TalkSchema,
      talkFormat(),
    );
    this.remember(view, out);
    return this.requireText(out.public_message, `${wolf.name} produced an empty pack message`);
  }

  async chooseNightKill(state: GameState, werewolf: Player): Promise<string> {
    const view = buildPlayerView(state, werewolf.id);
    const options = shuffle(nightKillTargets(state), this.rng);
    const out = await this.client.chat(
      this.messages(view, nightKillPrompt(view, this.notes(werewolf.id), options)),
      TargetSchema,
      targetFormat(options.map((p) => p.name)),
    );
    this.remember(view, out);
    return this.resolveTarget(view, options, out.target, 'target');
  }

  // The seer's pick. She does NOT yet know the result, so this turn updates no memory
  // — it only chooses a target (we surface the reasoning). The reflection on what she
  // learns happens afterwards in reflectOnInvestigation, once the result is known.
  async chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    const view = buildPlayerView(state, seer.id);
    const options = shuffle(investigationTargets(state, seer.id), this.rng);
    const out = await this.client.chat(
      this.messages(view, investigationPrompt(view, this.notes(seer.id), options)),
      TargetSchema,
      targetFormat(options.map((p) => p.name)),
    );
    this.onThought?.({ player: seer.name, role: seer.role, reasoning: out.private_reasoning });
    return this.resolveTarget(view, options, out.target, 'investigation target');
  }

  // After the engine has revealed the investigated player's role, the seer reflects on
  // the TRUE finding and records it. This is the only place the seer's investigation
  // memory is written — so it can never contain a guessed result.
  async reflectOnInvestigation(state: GameState, seer: Player, investigated: Player): Promise<void> {
    const view = buildPlayerView(state, seer.id);
    const out = await this.client.chat(
      this.messages(
        view,
        investigationResultPrompt(view, this.notes(seer.id), investigated.name, ROLE_META[investigated.role].displayName),
      ),
      ReflectionSchema,
      reflectionFormat(),
    );
    this.remember(view, out, `learned ${investigated.name} is a ${ROLE_META[investigated.role].displayName}`);
  }

  async chooseWitchHeal(state: GameState, witch: Player, victim: Player): Promise<boolean> {
    const view = buildPlayerView(state, witch.id);
    const out = await this.client.chat(
      this.messages(view, witchHealPrompt(view, this.notes(witch.id), victim.name, victim.id === witch.id)),
      HealSchema,
      healFormat(),
    );
    this.remember(view, out);
    return out.heal.trim().toLowerCase() === 'save';
  }

  async chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    const view = buildPlayerView(state, witch.id);
    const options = shuffle(poisonTargets(state, witch.id), this.rng);
    const out = await this.client.chat(
      this.messages(view, witchPoisonPrompt(view, this.notes(witch.id), options)),
      TargetSchema,
      targetFormat([...options.map((p) => p.name), NONE]),
    );
    this.remember(view, out);
    if (out.target.trim().toLowerCase() === NONE) return null; // chose not to poison
    return this.resolveTarget(view, options, out.target, 'poison target');
  }

  async chooseVote(state: GameState, voter: Player): Promise<string | null> {
    const view = buildPlayerView(state, voter.id);
    const options = shuffle(voteTargets(state, voter.id), this.rng);
    const isRunoff = state.phaseData.phase === 'day-vote' && state.phaseData.isRunoff;
    const out = await this.client.chat(
      this.messages(view, votePrompt(view, this.notes(voter.id), options, isRunoff)),
      VoteSchema,
      voteFormat([...options.map((p) => p.name), ABSTAIN]),
    );
    this.remember(view, out);
    if (out.vote.trim().toLowerCase() === ABSTAIN) return null; // chose to abstain
    return this.resolveTarget(view, options, out.vote, 'vote');
  }

  async chooseSpeech(state: GameState, speaker: Player): Promise<string> {
    const view = buildPlayerView(state, speaker.id);
    const intendedVoteValues = view.alive
      .filter((p) => p.id !== speaker.id)
      .map((p) => p.name)
      .concat('undecided');

    // From the 2nd debate round on, the player commits (grammar-constrained) to speak
    // or pass — "I have nothing to add" is a reliable structured choice, not text.
    const reactionRound = state.phaseData.phase === 'day-debate' && state.phaseData.round > 1;
    if (reactionRound) {
      const out = await this.client.chat(
        this.messages(view, speechPrompt(view, this.notes(speaker.id), true)),
        ReactionSchema,
        reactionFormat(intendedVoteValues),
      );
      this.remember(view, out, `leans toward: ${out.intended_vote}`);
      if (out.contribution.trim().toLowerCase() === 'pass') return ''; // chose to add nothing
      return out.public_message.trim().slice(0, MAX_SPEECH_LENGTH); // empty here is also a silent pass
    }

    const out = await this.client.chat(
      this.messages(view, speechPrompt(view, this.notes(speaker.id), false)),
      SpeechSchema,
      speechFormat(intendedVoteValues),
    );
    this.remember(view, out, `leans toward: ${out.intended_vote}`);
    const message = out.public_message.trim();
    // TODO: instead of throwing, ask the model to actually say something.
    if (!message) throw new Error(`${speaker.name} produced an empty speech`);
    return message.slice(0, MAX_SPEECH_LENGTH);
  }

  async reflect(state: GameState, player: Player, deceased: Player, cause: 'vote' | 'night-kill' | 'poison'): Promise<void> {
    const view = buildPlayerView(state, player.id);
    const out = await this.client.chat(
      this.messages(view, reflectionPrompt(view, this.notes(player.id), deceased.name, cause)),
      ReflectionSchema,
      reflectionFormat(),
    );
    this.remember(view, out, `reflecting on ${deceased.name}'s death`);
  }

  // --- helpers ---

  private notes(playerId: string): string {
    return this.memory.get(playerId) ?? '';
  }

  // Stores the player's updated memory and surfaces their private reasoning + the
  // memory note they kept (for watch/eval observability).
  private remember(view: PlayerView, out: { private_reasoning: string; memory_update: string }, note?: string): void {
    this.memory.set(view.self.id, out.memory_update);
    this.onThought?.({
      player: view.self.name,
      role: view.self.role,
      reasoning: out.private_reasoning,
      memory: out.memory_update,
      note,
    });
  }

  private messages(view: PlayerView, user: string): ChatMessage[] {
    return [
      { role: 'system', content: systemPrompt(view) },
      { role: 'user', content: user },
    ];
  }

  private requireText(value: string, errorIfEmpty: string): string {
    const text = value.trim();
    // TODO: instead of throwing, ask the model to actually say something — just
    // correcting the answer, not re-reasoning the whole turn.
    if (!text) throw new Error(errorIfEmpty);
    return text.slice(0, MAX_SPEECH_LENGTH);
  }

  // Maps a constrained answer back to a legal player id; throws if somehow invalid.
  private resolveTarget(view: PlayerView, options: Player[], value: string, label: string): string {
    if (options.length === 0) throw new Error(`No legal ${label} options for ${view.self.name}`);
    const matched = matchOption(value, options);
    if (!matched) {
      // TODO: instead of throwing, tell the model "<value>" wasn't a listed player
      // and ask it to reply again with only a valid name — just correcting the answer.
      throw new Error(`${view.self.name} gave an invalid ${label} "${value}"; legal: ${options.map((p) => p.name).join(', ')}`);
    }
    return matched;
  }
}
