import { MoonIcon, SunIcon } from '../assets/icons';
import { Phase } from '../types';
import { Narrator } from './Narrator';

type Props = {
  isNight: boolean;
  round: number;
  phase: Phase | null;
  activity: string | null; // current NPC activity label
  yourTurn: boolean;
};

// The middle of the table — all the informative text lives here: the day/night body,
// the round, the phase narration, and a live status line ("Your turn", or who/what is
// currently thinking).
export function Stage({ isNight, round, phase, activity, yourTurn }: Props) {
  return (
    <div className={`stage ${isNight ? 'night' : 'day'}`}>
      <div className="stage-body">{isNight ? <MoonIcon /> : <SunIcon />}</div>
      <div className="stage-phase">
        {isNight ? 'Night' : 'Day'}
        {round > 0 ? ` · Round ${round}` : ''}
      </div>
      <Narrator phase={phase} />
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
