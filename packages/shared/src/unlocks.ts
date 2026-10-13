import type { WeaponId } from './weapons';

/**
 * Weapon unlocks: you start with an assault rifle and a pistol; the rest are found in the campaign
 * (picking one up unlocks it for good) or earned in Gun Game.
 */
export const STARTING_WEAPONS: WeaponId[] = ['rifle', 'pistol'];

export const WEAPON_UNLOCKS: Record<WeaponId, { how: string }> = {
  rifle: { how: 'Standard issue.' },
  pistol: { how: 'Standard issue.' },
  smg: { how: 'Find it in the Mansion security room.' },
  shotgun: { how: 'Find it in the Mansion garage.' },
  sniper: { how: 'Find it on the Mansion roof.' },
  golden: { how: 'Find it in the Mansion vault, or win a game of Gun Game.' },
};

/** Cleans a saved unlock list: known weapons only, starting weapons always included. */
export function normalizeUnlocks(saved: unknown): WeaponId[] {
  const known = Object.keys(WEAPON_UNLOCKS) as WeaponId[];
  const list = Array.isArray(saved) ? saved.filter((w): w is WeaponId => known.includes(w as WeaponId)) : [];
  return known.filter(w => STARTING_WEAPONS.includes(w) || list.includes(w));
}
