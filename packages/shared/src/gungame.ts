import type { WeaponId } from './weapons';

export interface LadderRung {
  weapon: WeaponId;
  /** Kills needed with this weapon to advance. */
  kills: number;
}

/** Gun Game weapon progression. A kill on the last rung wins the match. */
export const GUN_GAME_LADDER: readonly LadderRung[] = [
  { weapon: 'pistol', kills: 2 },
  { weapon: 'smg', kills: 2 },
  { weapon: 'shotgun', kills: 2 },
  { weapon: 'rifle', kills: 2 },
  { weapon: 'sniper', kills: 2 },
  { weapon: 'golden', kills: 1 },
];
