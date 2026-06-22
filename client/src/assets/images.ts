import { Role, Team } from '../types';

// Optional raster art the player generates (see the plan's Nano Banana prompts) and
// drops into client/public/images/. These are referenced by URL, NOT imported, so a
// missing file just 404s and the code-drawn fallback shows — the app works with zero
// images present and upgrades the moment the files appear.
const base = '/images';

export const backdrop = (night: boolean): string => `${base}/${night ? 'bg-night' : 'bg-day'}.png`;
export const roleCard = (role: Role): string => `${base}/role-${role}.png`;
export const finaleScene = (winner: Team): string =>
  `${base}/${winner === 'werewolves' ? 'finale-wolves' : 'finale-village'}.png`;
