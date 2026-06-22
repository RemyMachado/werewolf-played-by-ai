import { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SeatModel, seatIndex, seatPos } from '../seats';
import { SpeechFx, VoteFx } from '../useGameFx';
import { Seat } from './Seat';
import { SpeechMark } from './SpeechMark';
import { VoteArrow } from './VoteArrow';

type Props = {
  seats: SeatModel[];
  actingId: string | null;
  targetIds: Set<string>;
  onSeatClick: (id: string) => void;
  center: ReactNode;
  speech: SpeechFx | null;
  vote: VoteFx | null;
};

// The game board: seats evenly spaced around an ellipse with the night/day stage in
// the middle, plus an FX overlay (speech bubbles, vote arrows) sharing the exact same
// coordinate space via seatPos.
export function Table({ seats, actingId, targetIds, onSeatClick, center, speech, vote }: Props) {
  const n = seats.length;
  const posOf = (id: string) => {
    const i = seatIndex(seats, id);
    return i < 0 ? null : seatPos(i, n);
  };

  const speechPos = speech ? posOf(speech.seatId) : null;
  const voteFrom = vote ? posOf(vote.fromId) : null;
  const voteTo = vote?.toId ? posOf(vote.toId) : null;

  return (
    <div className="table">
      <div className="table-felt" />
      <div className="table-center">{center}</div>

      {seats.map((seat, i) => {
        const p = seatPos(i, n);
        return (
          <Seat
            key={seat.id}
            seat={seat}
            acting={seat.id === actingId}
            targetable={targetIds.has(seat.id)}
            onClick={onSeatClick}
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
          />
        );
      })}

      <div className="fx-layer">
        {vote && voteFrom && <VoteArrow key={`v${vote.key}`} from={voteFrom} to={voteTo} />}
        <AnimatePresence>
          {speech && speechPos && <SpeechMark key={`s${speech.key}`} left={speechPos.left} top={speechPos.top} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
