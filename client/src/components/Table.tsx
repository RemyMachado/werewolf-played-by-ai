import { CSSProperties, ReactNode } from 'react';
import { SeatModel } from '../seats';
import { Seat } from './Seat';

type Props = {
  seats: SeatModel[];
  actingId: string | null;
  targetIds: Set<string>;
  onSeatClick: (id: string) => void;
  center: ReactNode;
};

// The game board: seats evenly spaced around an ellipse with the night/day stage in
// the middle. Positions are derived purely from seat order, so they stay put as the
// game proceeds (the dead keep their place, greyed out).
export function Table({ seats, actingId, targetIds, onSeatClick, center }: Props) {
  const n = Math.max(seats.length, 1);
  return (
    <div className="table">
      <div className="table-felt" />
      <div className="table-center">{center}</div>
      {seats.map((seat, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2; // start at the top, go clockwise
        const style: CSSProperties = {
          left: `${50 + 43 * Math.cos(angle)}%`,
          top: `${50 + 45 * Math.sin(angle)}%`,
        };
        return (
          <Seat
            key={seat.id}
            seat={seat}
            acting={seat.id === actingId}
            targetable={targetIds.has(seat.id)}
            onClick={onSeatClick}
            style={style}
          />
        );
      })}
    </div>
  );
}
