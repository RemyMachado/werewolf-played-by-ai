import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { GameState } from './useGame';

// Transient, self-dismissing visual flourishes derived from the FRESHEST log entry:
// a speech bubble over a speaker, a flying vote marker. The authoritative game state
// (board, log, cockpit) is always rendered directly from useGame — these are purely
// additive eye-candy layered on top.
//
// Two hard rules from the plan: (1) snap-on-bulk — when many entries arrive at once
// (reconnect/replay) or motion is reduced, play NO transient fx (the state just
// appears); (2) live play sends one entry at a time, seconds apart, so a single fresh
// entry animates. Deaths animate via the seat itself (view diff), not here.
export type SpeechFx = { seatId: string; key: number };
export type VoteFx = { fromId: string; toId: string | null; key: number };

const SPEECH_DWELL_MS = 5000;
const VOTE_FLIGHT_MS = 1100;
const BULK_THRESHOLD = 2; // more than this many new entries at once = a replay burst → snap

export function useGameFx(state: GameState): { speech: SpeechFx | null; vote: VoteFx | null; reduce: boolean } {
  const reduce = useReducedMotion() ?? false;
  const processed = useRef(0);
  const keySeq = useRef(0);
  const [speech, setSpeech] = useState<SpeechFx | null>(null);
  const [vote, setVote] = useState<VoteFx | null>(null);

  useEffect(() => {
    const log = state.log;
    const fresh = log.length - processed.current;
    processed.current = log.length;
    if (fresh <= 0) return; // reset / no change
    if (reduce || fresh > BULK_THRESHOLD) return; // reduced motion or bulk replay → snap

    const last = log[log.length - 1];
    const key = ++keySeq.current;
    if (last.type === 'speech') setSpeech({ seatId: last.playerId, key });
    else if (last.type === 'vote') setVote({ fromId: last.voterId, toId: last.targetId, key });
  }, [state.log, reduce]);

  useEffect(() => {
    if (!speech) return;
    const t = setTimeout(() => setSpeech((s) => (s?.key === speech.key ? null : s)), SPEECH_DWELL_MS);
    return () => clearTimeout(t);
  }, [speech]);

  useEffect(() => {
    if (!vote) return;
    const t = setTimeout(() => setVote((v) => (v?.key === vote.key ? null : v)), VOTE_FLIGHT_MS);
    return () => clearTimeout(t);
  }, [vote]);

  return { speech, vote, reduce };
}
