import { GameState, LogEntry, Player } from '../types/game';
import {
  recordSpeech,
  recordVote,
  recordWolfKillVote,
  recordWolfMessage,
  resolveNight,
  resolveWolfKill,
  setNightInvestigateTarget,
  setNightKillTarget,
  setWitchHeal,
  setWitchPoison,
  startGame,
} from './engine';
import { getAlivePlayers, getAliveWerewolves, getPlayerById, getSeer, getWitch } from './state';
import { Rng, shuffle } from './rng';
import { PlayerController } from './controller';

// Notified after every state change that adds to the public log (or the private
// wolf channel). Receives the full state — the consumer decides what to reveal.
// The seam the CLI watcher and the Phase 4 event stream both build on.
export type GameObserver = (state: GameState) => void | Promise<void>;

export type RunGameOptions = {
  observe?: GameObserver;
  wolfTalkRounds?: number; // night discussion passes when 2+ wolves are alive
  debateRounds?: number; // day debate passes (round 2+ are reaction rounds; players may stay silent)
  reflectOnDeath?: boolean; // private per-player reflection after each death (default on)
  rng?: Rng; // randomises who acts first each phase (default Math.random)
};

const DEFAULT_WOLF_TALK_ROUNDS = 2;
const DEFAULT_DEBATE_ROUNDS = 2;

// Drives a game from its current phase to game-over, asking the controller for
// every decision and applying it with the engine. Free of I/O — the controller
// owns interaction, the observer owns output. Returns the final (game-over) state.
export async function runGame(
  initial: GameState,
  controller: PlayerController,
  options: RunGameOptions = {},
): Promise<GameState> {
  const observe = options.observe;
  const talkRounds = options.wolfTalkRounds ?? DEFAULT_WOLF_TALK_ROUNDS;
  const debateRounds = options.debateRounds ?? DEFAULT_DEBATE_ROUNDS;
  const reflectEnabled = options.reflectOnDeath ?? true;
  const rng = options.rng ?? Math.random;

  let state = initial;
  if (state.phaseData.phase === 'lobby') state = startGame(state);
  await observe?.(state);

  while (state.phaseData.phase !== 'game-over') {
    const before = state;
    switch (state.phaseData.phase) {
      case 'night':
        state = await runNight(state, controller, observe, talkRounds, rng);
        break;
      case 'day-debate':
        state = await runDebate(state, controller, observe, rng, debateRounds);
        break;
      case 'day-vote':
        state = await runVote(state, controller, observe, rng);
        break;
    }
    await reflectOnDeaths(before, state, controller, reflectEnabled);
  }
  return state;
}

// After a phase, every living player privately reflects on each fresh death (and
// the role it revealed), updating their memory. No public output; the game state
// is unchanged — only the controllers' private memory is. Skipped once the game is
// over (no point), when disabled, or for the opening night (round 1): that kill is
// random and nobody has spoken yet, so there is nothing to reflect on — and at round
// 1 the only deaths are those night kills (a day-1 lynch bumps the round to 2 first).
async function reflectOnDeaths(
  before: GameState,
  after: GameState,
  controller: PlayerController,
  enabled: boolean,
): Promise<void> {
  if (!enabled || after.phaseData.phase === 'game-over') return;
  if (after.round === 1) return; // opening-night kill — random, nothing to deduce yet
  const newDeaths = after.log
    .slice(before.log.length)
    .filter((e): e is Extract<LogEntry, { type: 'elimination' }> => e.type === 'elimination');

  for (const death of newDeaths) {
    const deceased = after.players.find((p) => p.id === death.playerId);
    if (!deceased) continue;
    for (const player of getAlivePlayers(after)) {
      await controller.reflect?.(after, player, deceased, death.cause);
    }
  }
}

async function runNight(
  state: GameState,
  controller: PlayerController,
  observe: GameObserver | undefined,
  talkRounds: number,
  rng: Rng,
): Promise<GameState> {
  const wolves = getAliveWerewolves(state);
  if (wolves.length === 0) throw new Error('Reached night with no living werewolf');

  state = await runWolfKill(state, controller, observe, talkRounds, wolves, rng);
  await observe?.(state); // reveal the pack's chosen victim now (watch mode), before the seer/witch act

  const seer = getSeer(state);
  if (seer?.isAlive) {
    const investigateTarget = await controller.chooseInvestigation(state, seer);
    state = setNightInvestigateTarget(state, seer.id, investigateTarget);
    await observe?.(state); // reveal the finding now (watch mode), right after the seer acts
    // Only now — having used her power and seen the result — does the seer reflect.
    await controller.reflectOnInvestigation?.(state, seer, getPlayerById(state, investigateTarget));
  }

  state = await runWitch(state, controller, observe);

  state = resolveNight(state); // the only public night change
  await observe?.(state);
  return state;
}

// The witch acts last: she sees the wolves' victim and may heal them and/or poison
// someone — each potion once per game. Skipped if there is no living witch.
async function runWitch(
  state: GameState,
  controller: PlayerController,
  observe: GameObserver | undefined,
): Promise<GameState> {
  if (state.phaseData.phase !== 'night') return state;
  const witch = getWitch(state);
  if (!witch?.isAlive) return state;

  const victimId = state.phaseData.pendingKillTarget;
  if (!state.witchHealUsed && victimId) {
    const heal = await controller.chooseWitchHeal?.(state, witch, getPlayerById(state, victimId));
    if (heal) {
      state = setWitchHeal(state, witch.id);
      await observe?.(state); // reveal the (otherwise silent) save in watch mode
    }
  }

  if (state.phaseData.phase === 'night' && !state.witchPoisonUsed) {
    const poisonTarget = await controller.chooseWitchPoison?.(state, witch);
    if (poisonTarget) {
      state = setWitchPoison(state, witch.id, poisonTarget);
      await observe?.(state);
    }
  }

  return state;
}

async function runWolfKill(
  state: GameState,
  controller: PlayerController,
  observe: GameObserver | undefined,
  talkRounds: number,
  wolves: Player[],
  rng: Rng,
): Promise<GameState> {
  // A lone wolf just picks — no one to confer with.
  if (wolves.length === 1) {
    const target = await controller.chooseNightKill(state, wolves[0]);
    return setNightKillTarget(state, wolves[0].id, target);
  }

  // Private discussion — but only from round 2 on. The opening night has no game
  // history to reason about, so a "discussion" there can only confabulate. Order is
  // shuffled ONCE (for fairness) and reused each pass, so the talk reads as a real
  // round-robin back-and-forth (each wolf replies to the last) instead of jumping
  // around with the same wolf sometimes speaking twice in a row.
  if (state.round > 1) {
    const order = shuffle(wolves, rng);
    for (let round = 0; round < talkRounds; round++) {
      for (const wolf of order) {
        const message = await controller.chooseNightTalk(state, wolf);
        state = recordWolfMessage(state, wolf.id, message);
        await observe?.(state);
      }
    }
  }

  // Private kill votes: NPC wolves in random order, then a human wolf last so they
  // see the pack's votes and have the final say.
  const humanWolf = wolves.find((w) => w.isHuman);
  const npcWolves = shuffle(
    wolves.filter((w) => !w.isHuman),
    rng,
  );
  const voteOrder = humanWolf ? [...npcWolves, humanWolf] : npcWolves;
  for (const wolf of voteOrder) {
    const target = await controller.chooseNightKill(state, wolf);
    state = recordWolfKillVote(state, wolf.id, target);
    await observe?.(state);
  }

  if (state.phaseData.phase !== 'night') throw new Error('Wolf vote left night phase unexpectedly');
  const victim = resolveWolfKill(state.phaseData.wolfVotes, state.players, humanWolf?.id);
  const decider = humanWolf ?? wolves[0];
  return setNightKillTarget(state, decider.id, victim);
}

async function runDebate(
  state: GameState,
  controller: PlayerController,
  observe: GameObserver | undefined,
  rng: Rng,
  debateRounds: number,
): Promise<GameState> {
  // Pick the next speaker at random among those who haven't spoken THIS round, so it
  // isn't always the same player opening. recordSpeech advances through the debate
  // rounds and then to day-vote on its own: when a round's last speaker is done it
  // either resets for the next reaction round or transitions to the vote. The loop
  // therefore flows across rounds without any special handling here.
  for (;;) {
    const pd = state.phaseData;
    if (pd.phase !== 'day-debate') break;
    const remaining = getAlivePlayers(state).filter((p) => !pd.speechesDone.includes(p.id));
    if (remaining.length === 0) break;
    const next = shuffle(remaining, rng)[0];
    const speech = await controller.chooseSpeech(state, next);
    state = recordSpeech(state, next.id, speech, debateRounds);
    await observe?.(state);
  }
  return state;
}

async function runVote(
  state: GameState,
  controller: PlayerController,
  observe: GameObserver | undefined,
  rng: Rng,
): Promise<GameState> {
  // Random voter order too. recordVote auto-resolves once the last alive player
  // votes; a tie restarts the loop with reset votes for the runoff round.
  for (;;) {
    const pd = state.phaseData;
    if (pd.phase !== 'day-vote') break;
    const remaining = getAlivePlayers(state).filter((p) => !(p.id in pd.votes));
    if (remaining.length === 0) break;
    const next = shuffle(remaining, rng)[0];
    const target = await controller.chooseVote(state, next);
    state = recordVote(state, next.id, target);
    await observe?.(state);
  }
  return state;
}
