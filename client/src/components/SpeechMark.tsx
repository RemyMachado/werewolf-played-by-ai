import { motion } from 'framer-motion';

// A brief 💬 marker that pops over a seat to show they just spoke. The actual line is
// read in the History panel — the board only signals WHO is talking, not WHAT.
export function SpeechMark({ left, top }: { left: number; top: number }) {
  return (
    <motion.div
      className="speech-mark"
      style={{ left: `${left}%`, top: `${top}%` }}
      initial={{ opacity: 0, y: 8, scale: 0.5 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 340, damping: 22 }}
      aria-hidden
    >
      💬
    </motion.div>
  );
}
