import { normalizeLook, type CharacterLook, type LookSlot } from '@gungame/shared';
import { storage } from './storage';

/** The player's saved character look. */
export const characterLook = {
  get(): CharacterLook {
    return normalizeLook(storage.get<Partial<CharacterLook>>('character', {}));
  },
  set(slot: LookSlot, option: string): CharacterLook {
    const next = normalizeLook({ ...this.get(), [slot]: option });
    storage.set('character', next);
    return next;
  },
};
