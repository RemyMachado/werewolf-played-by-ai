import { Player } from '../types/game';
import { colorizeNames } from './render';
import { wrap } from './style';

// A single output function. Every line of game output is routed through this: names
// are colored by role (in one place, so it's never forgotten) and long lines are
// word-wrapped to a readable width. `reveal` is on for watch/god mode and off for a
// human player (whose colors must not leak living players' roles).
export type Say = (text: string) => void;

export function makeSay(sink: (text: string) => void, players: Player[], reveal: boolean): Say {
  return (text) => sink(wrap(colorizeNames(text, players, reveal)));
}
