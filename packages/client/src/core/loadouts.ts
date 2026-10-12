import { normalizeLoadout, type Loadout, type Slot, type WeaponId } from '@gungame/shared';
import { storage } from './storage';

/** The player's saved weapon customizations. */
export const loadouts = {
  get(weapon: WeaponId): Loadout {
    const all = storage.get<Partial<Record<WeaponId, Loadout>>>('loadouts', {});
    return normalizeLoadout(weapon, all[weapon]);
  },
  set(weapon: WeaponId, slot: Slot, attachment: string): Loadout {
    const all = storage.get<Partial<Record<WeaponId, Loadout>>>('loadouts', {});
    const next = normalizeLoadout(weapon, { ...all[weapon], [slot]: attachment });
    storage.set('loadouts', { ...all, [weapon]: next });
    return next;
  },
};
