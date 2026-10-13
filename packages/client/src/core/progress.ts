import { normalizeUnlocks, type WeaponId } from '@gungame/shared';
import { storage } from './storage';

/** Saved progress: which weapons are unlocked. */
export const progress = {
  unlocked(): WeaponId[] {
    return normalizeUnlocks(storage.get<unknown>('unlocks', []));
  },
  isUnlocked(id: WeaponId): boolean {
    return this.unlocked().includes(id);
  },
  /** Returns true if this unlocked something new. */
  unlock(id: WeaponId): boolean {
    const list = this.unlocked();
    if (list.includes(id)) return false;
    storage.set('unlocks', [...list, id]);
    return true;
  },
};
