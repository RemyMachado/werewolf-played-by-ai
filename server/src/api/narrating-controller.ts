import { GameState, Player } from '../types/game';
import { PlayerController } from '../game/controller';

export type Activity = {
  kind: 'wolves' | 'seer' | 'witch' | 'speaking' | 'voting';
  actorId: string | null;
};
export type OnActivity = (activity: Activity) => void;

// A pass-through PlayerController that announces WHO is about to act and WHAT they are
// doing, just before delegating to the wrapped controller — so the UI can show a live
// "… is thinking" indicator during the (multi-second) LLM call instead of only seeing
// results pop in. Wrap ONLY the NPC controller: the human's turns are already signalled
// by a prompt.
//
// Hidden-information safe: the actor id is exposed ONLY for public day actions
// (speaking/voting, which become public anyway). Night roles announce the ROLE that is
// acting (wolves/seer/witch) with actorId = null, never naming who holds it.
export class NarratingController implements PlayerController {
  constructor(
    private readonly inner: PlayerController,
    private readonly onActivity: OnActivity,
  ) {}

  chooseNightTalk(state: GameState, wolf: Player): Promise<string> {
    this.onActivity({ kind: 'wolves', actorId: null });
    return this.inner.chooseNightTalk(state, wolf);
  }

  chooseNightKill(state: GameState, werewolf: Player): Promise<string> {
    this.onActivity({ kind: 'wolves', actorId: null });
    return this.inner.chooseNightKill(state, werewolf);
  }

  chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    this.onActivity({ kind: 'seer', actorId: null });
    return this.inner.chooseInvestigation(state, seer);
  }

  reflectOnInvestigation(state: GameState, seer: Player, investigated: Player): Promise<void> {
    return this.inner.reflectOnInvestigation?.(state, seer, investigated) ?? Promise.resolve();
  }

  chooseWitchHeal(state: GameState, witch: Player, victim: Player): Promise<boolean> {
    this.onActivity({ kind: 'witch', actorId: null });
    return this.inner.chooseWitchHeal?.(state, witch, victim) ?? Promise.resolve(false);
  }

  chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    this.onActivity({ kind: 'witch', actorId: null });
    return this.inner.chooseWitchPoison?.(state, witch) ?? Promise.resolve(null);
  }

  chooseSpeech(state: GameState, speaker: Player): Promise<string> {
    this.onActivity({ kind: 'speaking', actorId: speaker.id });
    return this.inner.chooseSpeech(state, speaker);
  }

  chooseVote(state: GameState, voter: Player): Promise<string | null> {
    this.onActivity({ kind: 'voting', actorId: voter.id });
    return this.inner.chooseVote(state, voter);
  }

  reflect(state: GameState, player: Player, deceased: Player, cause: 'vote' | 'night-kill' | 'poison'): Promise<void> {
    return this.inner.reflect?.(state, player, deceased, cause) ?? Promise.resolve();
  }
}
