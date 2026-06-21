import { PlayerView, Role } from './types';

// One seat at the table. `role` is set ONLY when legitimately known — for the human
// (self) and for the dead (revealed on death). Living others have no role here, so the
// hidden-info boundary is preserved right up to the UI.
export type SeatModel = { id: string; name: string; dead: boolean; role?: Role; isSelf: boolean };

export function buildSeats(view: PlayerView | null): SeatModel[] {
  if (!view) return [];
  const seats: SeatModel[] = [
    ...view.alive.map((p) => ({
      id: p.id,
      name: p.name,
      dead: false,
      role: p.id === view.self.id ? view.self.role : undefined,
      isSelf: p.id === view.self.id,
    })),
    ...view.dead.map((p) => ({ id: p.id, name: p.name, dead: true, role: p.role, isSelf: p.id === view.self.id })),
  ];
  // Stable seating: sort by the numeric part of the id (p1, p2, … p12).
  return seats.sort((a, b) => num(a.id) - num(b.id));
}

const num = (id: string): number => Number(id.replace(/\D/g, '')) || 0;
