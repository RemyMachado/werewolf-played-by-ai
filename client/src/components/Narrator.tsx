import { AnimatePresence, motion } from 'framer-motion';
import { Phase } from '../types';

const LINE: Partial<Record<Phase, string>> = {
  night: 'Night falls on Miller’s Hollow… the wolves stir.',
  'day-debate': 'Dawn breaks. The village gathers to talk.',
  'day-vote': 'The village calls for a reckoning — cast your vote.',
};

// A flavor banner that swaps with a fade whenever the phase changes. Purely
// atmospheric — the authoritative phase is always on the board's stage and log.
export function Narrator({ phase }: { phase: Phase | null }) {
  const text = phase ? LINE[phase] : null;
  return (
    <div className="narrator">
      <AnimatePresence mode="wait">
        {text && (
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5 }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
