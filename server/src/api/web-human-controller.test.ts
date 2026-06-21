import { describe, expect, it } from 'vitest';
import { createGame } from '../game/state';
import { seededRng } from '../game/rng';
import { buildPlayers } from '../game/presets';
import { GameState, Player } from '../types/game';
import { PromptDto } from './protocol';
import { WebHumanController } from './web-human-controller';

// A stub requestPrompt that captures the dto it was given and replies with whatever
// the test decides — letting us assert both the prompt shape and the answer mapping.
function withAnswer(reply: (dto: PromptDto) => string | null | boolean) {
  const seen: PromptDto[] = [];
  const controller = new WebHumanController(async (dto) => {
    seen.push(dto);
    return reply(dto);
  });
  return { controller, seen };
}

function lobbyState(): GameState {
  return createGame({ players: buildPlayers(5, 'You'), werewolfCount: 1 }, seededRng(1));
}
function pick(state: GameState, role: Player['role']): Player {
  const p = state.players.find((x) => x.role === role);
  if (!p) throw new Error(`no ${role} in fixture`);
  return p;
}

describe('WebHumanController', () => {
  it('offers a select for the vote with an abstain option, mapping abstain to null', async () => {
    const state = lobbyState();
    const voter = state.players[0];

    const voted = withAnswer((dto) => (dto.kind === 'select' ? dto.choices[0].value : ''));
    const id = await voted.controller.chooseVote(state, voter);
    expect(voted.seen[0].kind).toBe('select');
    expect(typeof id).toBe('string'); // a real candidate id

    const abstained = withAnswer((dto) => {
      if (dto.kind !== 'select') throw new Error('expected select');
      return dto.choices.find((c) => c.label === 'Abstain')!.value;
    });
    expect(await abstained.controller.chooseVote(state, voter)).toBeNull();
  });

  it("offers a poison select with a don't-poison option, mapping it to null", async () => {
    const state = lobbyState();
    const witch = state.players[0];

    const poisoned = withAnswer((dto) => (dto.kind === 'select' ? dto.choices[0].value : ''));
    expect(typeof (await poisoned.controller.chooseWitchPoison(state, witch))).toBe('string');

    const skipped = withAnswer((dto) => {
      if (dto.kind !== 'select') throw new Error('expected select');
      return dto.choices.find((c) => c.label === "Don't poison anyone")!.value;
    });
    expect(await skipped.controller.chooseWitchPoison(state, witch)).toBeNull();
  });

  it('maps a confirm answer to a boolean for the witch heal', async () => {
    const state = lobbyState();
    const witch = pick(state, 'seer'); // any player works as the actor here
    const victim = state.players[1];

    const saved = withAnswer(() => true);
    expect(await saved.controller.chooseWitchHeal(state, witch, victim)).toBe(true);
    expect(saved.seen[0].kind).toBe('confirm');

    const left = withAnswer(() => false);
    expect(await left.controller.chooseWitchHeal(state, witch, victim)).toBe(false);
  });

  it('trims speech text and treats empty as a silent pass', async () => {
    const state = lobbyState();
    const speaker = state.players[0];
    const spoke = withAnswer(() => '  I suspect Bob.  ');
    expect(await spoke.controller.chooseSpeech(state, speaker)).toBe('I suspect Bob.');
    expect(spoke.seen[0].kind).toBe('text');

    const quiet = withAnswer(() => '   ');
    expect(await quiet.controller.chooseSpeech(state, speaker)).toBe('');
  });

  it('falls back to a friendly placeholder for empty werewolf night-talk', async () => {
    const state = lobbyState();
    const wolf = state.players[0];
    const quiet = withAnswer(() => '');
    expect(await quiet.controller.chooseNightTalk(state, wolf)).toBe(`${wolf.name} says nothing.`);
  });
});
