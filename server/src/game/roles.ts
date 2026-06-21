import { Role, Team } from '../types/game';

type RoleMeta = {
  displayName: string;
  team: Team;
  hasNightAction: boolean;
};

export const ROLE_META: Record<Role, RoleMeta> = {
  villager: {
    displayName: 'Villager',
    team: 'villagers',
    hasNightAction: false,
  },
  werewolf: {
    displayName: 'Werewolf',
    team: 'werewolves',
    hasNightAction: true,
  },
  seer: {
    displayName: 'Seer',
    team: 'villagers',
    hasNightAction: true,
  },
  witch: {
    displayName: 'Witch',
    team: 'villagers',
    hasNightAction: true,
  },
};

export function getTeam(role: Role): Team {
  return ROLE_META[role].team;
}
