import { motion } from 'framer-motion';

type Pt = { left: number; top: number };

// A marker that flies from the voter's seat to their target, landing with a thump.
// Abstentions pass `to = null` and render nothing (the abstain reads on the seat).
export function VoteArrow({ from, to }: { from: Pt; to: Pt | null }) {
  if (!to) return null;
  return (
    <motion.div
      className="vote-arrow"
      style={{ left: `${from.left}%`, top: `${from.top}%` }}
      initial={{ left: `${from.left}%`, top: `${from.top}%`, scale: 0.6, opacity: 0 }}
      animate={{ left: `${to.left}%`, top: `${to.top}%`, scale: [0.6, 1, 0.9], opacity: [0, 1, 1] }}
      transition={{ duration: 0.9, ease: 'easeInOut' }}
    />
  );
}
