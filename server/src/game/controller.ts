import { GameState, Player } from '../types/game';

// The decision-making seam between the orchestrator and whoever is "playing" a
// given player — a human at the CLI now, NPCs and the web UI later. The
// orchestrator asks; implementations answer. Night/vote methods return the id of
// the chosen target; chooseSpeech returns the spoken text. The orchestrator feeds
// each answer straight to the engine, which rejects anything illegal.
export interface PlayerController {
  // A werewolf's private message to the pack during the night discussion.
  chooseNightTalk(state: GameState, wolf: Player): Promise<string>;
  // A werewolf's kill vote (after the discussion).
  chooseNightKill(state: GameState, werewolf: Player): Promise<string>;
  // The seer picks whom to investigate. The RESULT is not known at this point — the
  // engine reveals it right after (setNightInvestigateTarget), so this turn is the
  // choice only, never a reflection on a result that does not exist yet.
  chooseInvestigation(state: GameState, seer: Player): Promise<string>;
  // After the engine has revealed the investigated player's role, the seer reflects
  // on what she just learned and updates her memory. Optional — only controllers with
  // private memory (NPC) implement it; the human/testing seer already sees the result.
  reflectOnInvestigation?(state: GameState, seer: Player, investigated: Player): Promise<void>;
  // The witch, having seen the wolves' victim, decides whether to use her one-time
  // healing potion to save them. Optional — controllers without a witch omit it.
  chooseWitchHeal?(state: GameState, witch: Player, victim: Player): Promise<boolean>;
  // The witch decides whether to use her one-time poison potion, and on whom
  // (null = don't poison anyone).
  chooseWitchPoison?(state: GameState, witch: Player): Promise<string | null>;
  chooseSpeech(state: GameState, speaker: Player): Promise<string>;
  // Returns the chosen player's id, or null to abstain (cast no vote).
  chooseVote(state: GameState, voter: Player): Promise<string | null>;
  // Optional private reflection after a death: the player updates its memory based
  // on what happened. `cause` says how the deceased died (lynched vs killed in the
  // night), which the reflection is framed around. No public output. Controllers
  // without private memory (human, testing) simply omit it.
  reflect?(state: GameState, player: Player, deceased: Player, cause: 'vote' | 'night-kill' | 'poison'): Promise<void>;
}
