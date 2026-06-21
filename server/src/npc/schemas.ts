import { z } from 'zod';
import { OllamaFormat } from '../ollama/client';

// Every NPC turn returns private_reasoning + memory_update alongside its action.
// Only the action (public_message / vote / target) is ever shown to other players;
// the reasoning is private, and the memory is fed back to the SAME player next turn.
// Property order in the formats is reasoning → memory → action, so the model thinks
// (and updates its notes) BEFORE committing to the grammar-constrained action.

const base = { private_reasoning: z.string(), memory_update: z.string() };

export const TalkSchema = z.object({ ...base, public_message: z.string() });
export const SpeechSchema = z.object({ ...base, public_message: z.string(), intended_vote: z.string() });
// A reaction-round speech: the player first commits (grammar-constrained) to speak or
// pass, so "I have nothing to add" is a reliable structured choice, not parsed text.
export const ReactionSchema = z.object({
  ...base,
  contribution: z.string(), // "speak" | "pass"
  public_message: z.string(),
  intended_vote: z.string(),
});
export const TargetSchema = z.object({ ...base, target: z.string() });
export const VoteSchema = z.object({ ...base, vote: z.string() });
export const ReflectionSchema = z.object({ ...base }); // private reflection: reasoning + memory only, no action
export const HealSchema = z.object({ ...base, heal: z.string() }); // witch heal decision: "save" | "skip"

const STR = { type: 'string' };

function objectFormat(properties: Record<string, unknown>): OllamaFormat {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export function talkFormat(): OllamaFormat {
  return objectFormat({ private_reasoning: STR, memory_update: STR, public_message: STR });
}

export function speechFormat(intendedVoteValues: string[]): OllamaFormat {
  return objectFormat({
    private_reasoning: STR,
    memory_update: STR,
    public_message: STR,
    intended_vote: { type: 'string', enum: intendedVoteValues },
  });
}

export function reactionFormat(intendedVoteValues: string[]): OllamaFormat {
  // contribution comes BEFORE public_message so the model commits to speak/pass first.
  return objectFormat({
    private_reasoning: STR,
    memory_update: STR,
    contribution: { type: 'string', enum: ['speak', 'pass'] },
    public_message: STR,
    intended_vote: { type: 'string', enum: intendedVoteValues },
  });
}

export function targetFormat(values: string[]): OllamaFormat {
  return objectFormat({ private_reasoning: STR, memory_update: STR, target: { type: 'string', enum: values } });
}

export function voteFormat(values: string[]): OllamaFormat {
  return objectFormat({ private_reasoning: STR, memory_update: STR, vote: { type: 'string', enum: values } });
}

export function reflectionFormat(): OllamaFormat {
  return objectFormat({ private_reasoning: STR, memory_update: STR });
}

export function healFormat(): OllamaFormat {
  return objectFormat({ private_reasoning: STR, memory_update: STR, heal: { type: 'string', enum: ['save', 'skip'] } });
}
