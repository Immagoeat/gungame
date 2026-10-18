import { normalizeLook, type CharacterLook, type LookSlot } from '@gungame/shared';
import type { CivilianStyle } from '../entities/character/soldierOutfit';
import { storage } from './storage';

/**
 * The player's saved character look, and (during a mission) the clothes they're wearing over it:
 * a suit or a uniform for undercover work instead of the soldier's kit. The outfit isn't saved.
 */
export const characterLook = {
  outfit: null as CivilianStyle | null,
  get(): CharacterLook {
    return normalizeLook(storage.get<Partial<CharacterLook>>('character', {}));
  },
  set(slot: LookSlot, option: string): CharacterLook {
    const next = normalizeLook({ ...this.get(), [slot]: option });
    storage.set('character', next);
    return next;
  },
};
