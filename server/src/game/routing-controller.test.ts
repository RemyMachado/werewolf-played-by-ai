import { describe, expect, it } from 'vitest';
import { RoutingController } from './routing-controller';
import { PlayerController } from './controller';
import { GameState, Player } from '../types/game';

// A controller whose answers are tagged so we can tell which one was invoked.
function tagController(tag: string): PlayerController {
  return {
    async chooseNightTalk() {
      return `${tag}:talk`;
    },
    async chooseNightKill() {
      return `${tag}:kill`;
    },
    async chooseInvestigation() {
      return `${tag}:investigate`;
    },
    async chooseSpeech() {
      return `${tag}:speech`;
    },
    async chooseVote() {
      return `${tag}:vote`;
    },
  };
}

const human: Player = { id: 'h', name: 'You', role: 'werewolf', isAlive: true, isHuman: true };
const npc: Player = { id: 'n', name: 'Bob', role: 'villager', isAlive: true, isHuman: false };
const state = {} as GameState; // the tag controllers ignore state

describe('RoutingController', () => {
  const rc = new RoutingController(tagController('HUMAN'), tagController('NPC'));

  it('routes the human seat to the human controller', async () => {
    expect(await rc.chooseSpeech(state, human)).toBe('HUMAN:speech');
    expect(await rc.chooseVote(state, human)).toBe('HUMAN:vote');
    expect(await rc.chooseNightKill(state, human)).toBe('HUMAN:kill');
  });

  it('routes NPC seats to the NPC controller', async () => {
    expect(await rc.chooseSpeech(state, npc)).toBe('NPC:speech');
    expect(await rc.chooseInvestigation(state, npc)).toBe('NPC:investigate');
  });
});
