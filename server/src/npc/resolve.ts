import { Player } from '../types/game';

// Maps an answer from an LLM (a player's name, or sometimes an id) to a legal
// option's id. Returns null on no match so the caller can fail loudly — with
// grammar-constrained output a non-match should never happen, but we never feed
// the engine an unverified target.
export function matchOption(raw: string, options: Player[]): string | null {
  const needle = raw.trim().toLowerCase();
  const byName = options.find((p) => p.name.trim().toLowerCase() === needle);
  if (byName) return byName.id;
  const byId = options.find((p) => p.id.toLowerCase() === needle);
  return byId ? byId.id : null;
}
