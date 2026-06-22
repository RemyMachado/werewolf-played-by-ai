import { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { SeatModel } from '../seats';
import { Person } from '../assets/person';
import { RoleIcon } from '../assets/icons';
import { roleLabel } from '../format';

type Props = {
  seat: SeatModel;
  acting: boolean; // currently taking their turn (NPC) — pulse + "thinking" pose
  targetable: boolean; // a valid target for the current prompt — clickable
  onClick: (id: string) => void;
  style?: CSSProperties; // absolute left/top on the ellipse (the anchor centers it)
};

export function Seat({ seat, acting, targetable, onClick, style }: Props) {
  const classes = ['seat'];
  if (seat.dead) classes.push('dead');
  if (seat.isSelf) classes.push('me');
  if (acting) classes.push('acting');
  if (targetable) classes.push('targetable');

  const expression = acting && !seat.dead ? 'talking' : 'neutral';

  // The anchor owns positioning (centering transform); the inner motion element owns
  // the breathing / dead-slump animation, so the two transforms don't collide.
  return (
    <div className="seat-anchor" style={style}>
      <motion.div
        className={classes.join(' ')}
        onClick={targetable ? () => onClick(seat.id) : undefined}
        role={targetable ? 'button' : undefined}
        animate={seat.dead ? { y: 4, rotate: -4 } : { y: [0, -2, 0] }}
        transition={seat.dead ? { duration: 0.5 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="avatar">
          <Person name={seat.name} expression={expression} dead={seat.dead} />
          {acting && (
            <span className="seat-mark thinking" aria-hidden>
              💭
            </span>
          )}
          {targetable && <span className="reticle" aria-hidden />}
        </div>
        <div className="seat-name">
          {seat.name}
          {seat.isSelf && <span className="you"> (you)</span>}
        </div>
        {seat.role && (
          <motion.div
            className={`role-badge ${seat.role}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <RoleIcon role={seat.role} /> {roleLabel(seat.role)}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
