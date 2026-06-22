import { FormEvent, useState } from 'react';
import { NewGameRequest } from '../types';

type Props = {
  onStart: (req: NewGameRequest) => void;
};

// The official player-count presets (mirrors server/src/game/presets.ts): ~1 wolf per
// 4 players, witch from 8+.
type Preset = { label: string; players: number; werewolves: number; witch: boolean };
const PRESETS: Preset[] = [
  { label: '5 · 1 wolf', players: 5, werewolves: 1, witch: false },
  { label: '6 · 1 wolf', players: 6, werewolves: 1, witch: false },
  { label: '8 · 2 wolves · witch', players: 8, werewolves: 2, witch: true },
  { label: '10 · 2 wolves · witch', players: 10, werewolves: 2, witch: true },
  { label: '12 · 3 wolves · witch', players: 12, werewolves: 3, witch: true },
];

// Starts (or restarts) a game. Pick a preset for a quick official setup, or fine-tune
// the counts by hand.
export function NewGameForm({ onStart }: Props) {
  const [name, setName] = useState('John');
  const [players, setPlayers] = useState(5);
  const [werewolves, setWerewolves] = useState(1);
  const [witch, setWitch] = useState(false);
  const [seed, setSeed] = useState('');

  const applyPreset = (p: Preset) => {
    setPlayers(p.players);
    setWerewolves(p.werewolves);
    setWitch(p.witch);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onStart({
      humanName: name.trim() || 'John',
      players,
      werewolves,
      witch,
      seed: seed.trim() === '' ? undefined : Number(seed),
    });
  };

  return (
    <form className="new-game" onSubmit={submit}>
      <label>
        Preset
        <select
          onChange={(e) => {
            const p = PRESETS[Number(e.target.value)];
            if (p) applyPreset(p);
          }}
          defaultValue=""
        >
          <option value="" disabled>
            choose…
          </option>
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
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
      <button type="submit">New game</button>
    </form>
  );
}
