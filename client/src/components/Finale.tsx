import { motion } from 'framer-motion';
import { RosterEntry, Team } from '../types';
import { finaleScene } from '../assets/images';
import { RoleCard } from './RoleCard';

type Props = { winner: Team; roster: RosterEntry[]; onClose: () => void };

// The game-over scene: a themed finale image (gradient fallback) over a scoreboard
// revealing EVERY player's true role (the server sends the full roster at game over).
export function Finale({ winner, roster, onClose }: Props) {
  const wolvesWon = winner === 'werewolves';
  const ordered = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <motion.div
      className={`finale ${wolvesWon ? 'wolves' : 'village'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <div className="finale-img" style={{ backgroundImage: `url(${finaleScene(winner)})` }} />
      <button className="finale-quit" onClick={onClose}>
        Quit ✕
      </button>
      <div className="finale-body">
        <motion.h2 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>
          {wolvesWon ? 'The Werewolves prevail' : 'The Village prevails'}
        </motion.h2>
        <div className="scoreboard">
          {ordered.map((p, i) => (
            <motion.div
              key={p.id}
              className="score-row"
              initial={{ opacity: 0, rotateY: 90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              transition={{ delay: 0.4 + i * 0.12 }}
            >
              <RoleCard role={p.role} size={120} />
              <span className="score-name">{p.name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
