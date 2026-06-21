import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { NpcController } from './npc-controller';
import { ChatMessage, LlmClient, OllamaFormat } from '../ollama/client';
import { seededRng } from '../game/rng';
import { createGame } from '../game/state';
import { runGame } from '../game/orchestrator';
import { GameState, Player } from '../types/game';

// Fake LLM that returns whatever `respond(callIndex)` produces, validated against
// the requested schema (so a missing field still fails like the real client).
class FakeClient implements LlmClient {
  public calls = 0;
  constructor(private readonly respond: (call: number) => unknown) {}
  async chat<T>(_messages: ChatMessage[], schema: z.ZodType<T>, _format: OllamaFormat): Promise<T> {
    return schema.parse(this.respond(this.calls++));
  }
}

// Fake that honours the `format` like grammar-constrained decoding would: fills
// every property — enum fields get the first legal value, free-text fields get a
// placeholder. Produces a valid object for any of our decision shapes.
class ConstrainedFake implements LlmClient {
  async chat<T>(_messages: ChatMessage[], schema: z.ZodType<T>, format: OllamaFormat): Promise<T> {
    const props = (format as { properties: Record<string, { enum?: string[] }> }).properties;
    const obj: Record<string, string> = {};
    for (const [key, spec] of Object.entries(props)) {
      obj[key] = spec.enum ? spec.enum[0] : `auto ${key}`;
    }
    return schema.parse(obj);
  }
}

// Builds a fake reply with the always-present reasoning + memory fields plus the
// decision-specific fields under test.
function reply(fields: Record<string, string>): Record<string, string> {
  return { private_reasoning: 'because reasons', memory_update: 'noted', ...fields };
}

const players: Player[] = [
  { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
  { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
  { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: false },
  { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
];
const get = (id: string): Player => players.find((p) => p.id === id)!;

function nightState(): GameState {
  return {
    round: 1,
    players,
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: {
      phase: 'night',
      pendingKillTarget: null,
      pendingInvestigateTarget: null,
      wolfVotes: {},
      pendingHeal: false,
      pendingPoison: null,
    },
  };
}

function voteState(): GameState {
  return {
    round: 1,
    players,
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: { phase: 'day-vote', votes: {}, candidates: ['w1', 's1', 'v1', 'v2'], isRunoff: false },
  };
}

// A day-debate state on the given debate round (round 2+ = a reaction round, where a
// player may pass).
function debateState(debateRound: number): GameState {
  return {
    round: 1,
    players,
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: { phase: 'day-debate', speechesDone: [], round: debateRound },
  };
}

// A roster including a living witch (k1), used for the witch decision tests.
const witchPlayers: Player[] = [
  { id: 'w1', name: 'Wolf', role: 'werewolf', isAlive: true, isHuman: false },
  { id: 's1', name: 'Seer', role: 'seer', isAlive: true, isHuman: false },
  { id: 'k1', name: 'Wanda', role: 'witch', isAlive: true, isHuman: false },
  { id: 'v1', name: 'Alice', role: 'villager', isAlive: true, isHuman: false },
  { id: 'v2', name: 'Bob', role: 'villager', isAlive: true, isHuman: false },
];
const getWitchPlayer = (id: string): Player => witchPlayers.find((p) => p.id === id)!;

function witchNightState(pendingKillTarget: string | null = 'v1'): GameState {
  return {
    round: 1,
    players: witchPlayers,
    log: [],
    seerKnowledge: {},
    wolfChat: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    phaseData: {
      phase: 'night',
      pendingKillTarget,
      pendingInvestigateTarget: null,
      wolfVotes: {},
      pendingHeal: false,
      pendingPoison: null,
    },
  };
}

describe('NpcController', () => {
  it('resolves a named kill target to its id', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ target: 'Alice' })));
    expect(await npc.chooseNightKill(nightState(), get('w1'))).toBe('v1');
  });

  it('resolves a vote among the eligible candidates', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ vote: 'Wolf' })));
    expect(await npc.chooseVote(voteState(), get('v1'))).toBe('w1');
  });

  it('returns null when the model chooses to abstain', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ vote: 'abstain' })));
    expect(await npc.chooseVote(voteState(), get('v1'))).toBeNull();
  });

  it('uses the healing potion when the witch chooses to save', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ heal: 'save' })));
    expect(await npc.chooseWitchHeal(witchNightState(), getWitchPlayer('k1'), getWitchPlayer('v1'))).toBe(true);
  });

  it('keeps the healing potion when the witch chooses to skip', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ heal: 'skip' })));
    expect(await npc.chooseWitchHeal(witchNightState(), getWitchPlayer('k1'), getWitchPlayer('v1'))).toBe(false);
  });

  it('resolves a named poison target to its id', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ target: 'Bob' })));
    expect(await npc.chooseWitchPoison(witchNightState(), getWitchPlayer('k1'))).toBe('v2');
  });

  it('returns null when the witch chooses not to poison anyone', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ target: 'none' })));
    expect(await npc.chooseWitchPoison(witchNightState(), getWitchPlayer('k1'))).toBeNull();
  });

  it('throws on an illegal choice rather than guessing (no random fallback)', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ target: 'Nobody' })));
    await expect(npc.chooseNightKill(nightState(), get('w1'))).rejects.toThrow(/invalid target/);
  });

  it('propagates an LLM error instead of substituting a move', async () => {
    const npc = new NpcController(
      new FakeClient(() => {
        throw new Error('ollama down');
      }),
    );
    await expect(npc.chooseNightKill(nightState(), get('w1'))).rejects.toThrow(/ollama down/);
  });

  it('returns trimmed speech text from public_message', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ public_message: '  I suspect Bob.  ', intended_vote: 'Bob' })));
    expect(await npc.chooseSpeech(voteState(), get('v1'))).toBe('I suspect Bob.');
  });

  it('throws on empty speech', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ public_message: '   ', intended_vote: 'undecided' })));
    await expect(npc.chooseSpeech(voteState(), get('v1'))).rejects.toThrow(/empty speech/);
  });

  it('passes (returns "") in a reaction round when contribution is "pass"', async () => {
    const npc = new NpcController(
      new FakeClient(() => reply({ contribution: 'pass', public_message: 'ignored', intended_vote: 'undecided' })),
    );
    expect(await npc.chooseSpeech(debateState(2), get('v1'))).toBe('');
  });

  it('speaks in a reaction round when contribution is "speak"', async () => {
    const npc = new NpcController(
      new FakeClient(() => reply({ contribution: 'speak', public_message: 'I think Bob lied.', intended_vote: 'Bob' })),
    );
    expect(await npc.chooseSpeech(debateState(2), get('v1'))).toBe('I think Bob lied.');
  });

  it('still requires a real speech in the first debate round (no passing)', async () => {
    const npc = new NpcController(new FakeClient(() => reply({ public_message: '', intended_vote: 'undecided' })));
    await expect(npc.chooseSpeech(debateState(1), get('v1'))).rejects.toThrow(/empty speech/);
  });

  it('remembers and feeds back a player\'s memory across turns', async () => {
    const seen: string[] = [];
    // Capture what memory the prompt contained, then have the model write new notes.
    const client: LlmClient = {
      async chat(messages, schema) {
        seen.push(messages[1].content);
        return schema.parse(reply({ vote: 'Wolf', memory_update: 'Wolf looked nervous' }));
      },
    };
    const npc = new NpcController(client);
    await npc.chooseVote(voteState(), get('v1')); // first turn: notes empty
    await npc.chooseVote(voteState(), get('v1')); // second turn: notes carried forward
    expect(seen[0]).toContain('(empty — nothing noted yet)');
    expect(seen[1]).toContain('Wolf looked nervous');
  });

  it('does not write any memory on the seer\'s pick turn (the result is not known yet)', async () => {
    const events: { memory?: string }[] = [];
    const npc = new NpcController(new FakeClient(() => reply({ target: 'Alice' })), {
      onThought: (e) => events.push({ memory: e.memory }),
    });
    const target = await npc.chooseInvestigation(nightState(), get('s1'));
    expect(target).toBe('v1');
    expect(events).toHaveLength(1);
    expect(events[0].memory).toBeUndefined(); // memory is written only after the result is revealed
  });

  it('writes the seer\'s investigation memory only AFTER the result — from the model, fed the TRUE role (not hardcoded)', async () => {
    const seen: string[] = [];
    let storedMemory: string | undefined;
    const client: LlmClient = {
      async chat(messages, schema) {
        seen.push(messages[1].content);
        return schema.parse(reply({ memory_update: 'Alice is cleared; I will vouch for her' }));
      },
    };
    const npc = new NpcController(client, { onThought: (e) => (storedMemory = e.memory) });
    await npc.reflectOnInvestigation(nightState(), get('s1'), get('v1')); // v1 = Alice, a villager
    // The TRUE result is fed into the prompt the seer reflects on...
    expect(seen[0]).toContain('Alice is a Villager');
    // ...and the memory kept is the MODEL's own words, not a hardcoded string.
    expect(storedMemory).toBe('Alice is cleared; I will vouch for her');
  });

  it('reflects privately (no public output) and feeds the new memory into later turns', async () => {
    const seen: string[] = [];
    const client: LlmClient = {
      async chat(messages, schema) {
        seen.push(messages[1].content);
        return schema.parse(reply({ vote: 'Wolf', memory_update: 'after reflection: I trust Bob now' }));
      },
    };
    const npc = new NpcController(client);
    await npc.reflect(nightState(), get('v1'), get('s1'), 'night-kill'); // reflect on Seer's death
    await npc.chooseVote(voteState(), get('v1'));
    expect(seen[1]).toContain('after reflection: I trust Bob now');
  });

  it('drives a full game to completion with grammar-constrained answers', async () => {
    const npc = new NpcController(new ConstrainedFake());
    const game = createGame(
      {
        players: [
          { id: 'p1', name: 'Alice', isHuman: false },
          { id: 'p2', name: 'Bob', isHuman: false },
          { id: 'p3', name: 'Cara', isHuman: false },
          { id: 'p4', name: 'Dan', isHuman: false },
          { id: 'p5', name: 'Eve', isHuman: false },
        ],
        werewolfCount: 1,
      },
      seededRng(3),
    );
    const final = await runGame(game, npc);
    expect(final.phaseData.phase).toBe('game-over');
  });

  it('drives a full game with a witch to completion (exercises witch decisions)', async () => {
    const npc = new NpcController(new ConstrainedFake());
    const game = createGame(
      {
        players: [
          { id: 'p1', name: 'Alice', isHuman: false },
          { id: 'p2', name: 'Bob', isHuman: false },
          { id: 'p3', name: 'Cara', isHuman: false },
          { id: 'p4', name: 'Dan', isHuman: false },
          { id: 'p5', name: 'Eve', isHuman: false },
          { id: 'p6', name: 'Finn', isHuman: false },
          { id: 'p7', name: 'Gus', isHuman: false },
          { id: 'p8', name: 'Hana', isHuman: false },
        ],
        werewolfCount: 2,
        includeWitch: true,
      },
      seededRng(5),
    );
    const final = await runGame(game, npc);
    expect(final.phaseData.phase).toBe('game-over');
  });
});
