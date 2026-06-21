import { MoonIcon, SunIcon } from '../assets/icons';

type Props = {
  isNight: boolean;
  round: number;
  activity: string | null; // current NPC activity label
  yourTurn: boolean;
};

// The middle of the table: the day/night body, the round, and a live status line —
// "Your turn" when the human must act, otherwise who/what is currently thinking.
export function Stage({ isNight, round, activity, yourTurn }: Props) {
  return (
    <div className={`stage ${isNight ? 'night' : 'day'}`}>
      <div className="stage-body">{isNight ? <MoonIcon /> : <SunIcon />}</div>
      <div className="stage-phase">{isNight ? 'Night' : 'Day'}{round > 0 ? ` · Round ${round}` : ''}</div>
      <div className="stage-status">
        {yourTurn ? (
          <span className="your-turn">Your turn</span>
        ) : activity ? (
          <span className="thinking">
            <span className="spinner" aria-hidden /> {activity}
          </span>
        ) : (
          <span className="muted">…</span>
        )}
      </div>
    </div>
  );
}
