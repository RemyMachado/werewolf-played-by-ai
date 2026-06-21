import { GameState, Player } from '../types/game';
import { PlayerController } from './controller';

// Routes each decision to a controller based on who is acting: the human seat goes
// to one controller, everyone else to another. This is the seam that lets one
// human play against NPCs through the same orchestrator and engine.
export class RoutingController implements PlayerController {
  constructor(
    private readonly human: PlayerController,
    private readonly npc: PlayerController,
  ) {}

  private forPlayer(player: Player): PlayerController {
    return player.isHuman ? this.human : this.npc;
  }

  chooseNightTalk(state: GameState, wolf: Player): Promise<string> {
    return this.forPlayer(wolf).chooseNightTalk(state, wolf);
  }
  chooseNightKill(state: GameState, werewolf: Player): Promise<string> {
    return this.forPlayer(werewolf).chooseNightKill(state, werewolf);
  }
  chooseInvestigation(state: GameState, seer: Player): Promise<string> {
    return this.forPlayer(seer).chooseInvestigation(state, seer);
  }
  reflectOnInvestigation(state: GameState, seer: Player, investigated: Player): Promise<void> {
    return this.forPlayer(seer).reflectOnInvestigation?.(state, seer, investigated) ?? Promise.resolve();
  }
  chooseWitchHeal(state: GameState, witch: Player, victim: Player): Promise<boolean> {
    return this.forPlayer(witch).chooseWitchHeal?.(state, witch, victim) ?? Promise.resolve(false);
  }
  chooseWitchPoison(state: GameState, witch: Player): Promise<string | null> {
    return this.forPlayer(witch).chooseWitchPoison?.(state, witch) ?? Promise.resolve(null);
  }
  chooseSpeech(state: GameState, speaker: Player): Promise<string> {
    return this.forPlayer(speaker).chooseSpeech(state, speaker);
  }
  chooseVote(state: GameState, voter: Player): Promise<string | null> {
    return this.forPlayer(voter).chooseVote(state, voter);
  }
  reflect(state: GameState, player: Player, deceased: Player, cause: 'vote' | 'night-kill' | 'poison'): Promise<void> {
    return this.forPlayer(player).reflect?.(state, player, deceased, cause) ?? Promise.resolve();
  }
}
