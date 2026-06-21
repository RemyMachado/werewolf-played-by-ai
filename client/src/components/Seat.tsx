import { CSSProperties } from 'react';
import { SeatModel } from '../seats';
import { Avatar, RoleIcon, SkullIcon } from '../assets/icons';
import { roleLabel } from '../format';

type Props = {
  seat: SeatModel;
  acting: boolean; // currently taking their turn (NPC) — show a pulse
  targetable: boolean; // a valid target for the current prompt — clickable
  onClick: (id: string) => void;
  style?: CSSProperties;
};

export function Seat({ seat, acting, targetable, onClick, style }: Props) {
  const classes = ['seat'];
  if (seat.dead) classes.push('dead');
  if (seat.isSelf) classes.push('me');
  if (acting) classes.push('acting');
  if (targetable) classes.push('targetable');

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onClick={targetable ? () => onClick(seat.id) : undefined}
      role={targetable ? 'button' : undefined}
    >
      <div className="avatar">
        <Avatar name={seat.name} />
        {acting && <span className="pulse" aria-hidden />}
        {seat.dead && (
          <span className="skull" aria-hidden>
            <SkullIcon />
          </span>
        )}
      </div>
      <div className="seat-name">
        {seat.name}
        {seat.isSelf && <span className="you"> (you)</span>}
      </div>
      {seat.role && (
        <div className={`role-badge ${seat.role}`}>
          <RoleIcon role={seat.role} /> {roleLabel(seat.role)}
        </div>
      )}
    </div>
  );
}
