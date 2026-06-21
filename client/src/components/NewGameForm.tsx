import { FormEvent, useState } from 'react';
import { NewGameRequest } from '../types';

type Props = {
  onStart: (req: NewGameRequest) => void;
  busy: boolean;
};

// Starts (or restarts) a game. The witch is an official 8+ role, so the checkbox
// defaults on once the player count reaches 8 — but stays user-overridable.
export function NewGameForm({ onStart, busy }: Props) {
  const [name, setName] = useState('You');
  const [players, setPlayers] = useState(5);
  const [werewolves, setWerewolves] = useState(1);
  const [witch, setWitch] = useState(false);
  const [seed, setSeed] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onStart({
      humanName: name.trim() || 'You',
      players,
      werewolves,
      witch,
      seed: seed.trim() === '' ? undefined : Number(seed),
    });
  };

  return (
    <form className="new-game" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Players
        <input type="number" min={3} max={16} value={players} onChange={(e) => setPlayers(Number(e.target.value))} />
      </label>
      <label>
        Werewolves
        <input type="number" min={1} max={4} value={werewolves} onChange={(e) => setWerewolves(Number(e.target.value))} />
      </label>
      <label className="check">
        <input type="checkbox" checked={witch} onChange={(e) => setWitch(e.target.checked)} />
        Witch
      </label>
      <label>
        Seed
        <input placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Playing…' : 'New game'}
      </button>
    </form>
  );
}
