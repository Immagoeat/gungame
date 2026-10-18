/**
 * Player character customization: pure data, so the server can validate and relay a player's look
 * in multiplayer. The client turns a CharacterLook into a dressed 3D soldier.
 */

export const LOOK_SLOTS = ['camo', 'headgear', 'vest', 'skin', 'face', 'hair', 'gloves', 'boots'] as const;
export type LookSlot = (typeof LOOK_SLOTS)[number];

export const LOOK_SLOT_NAMES: Record<LookSlot, string> = {
  camo: 'Uniform', headgear: 'Headgear', vest: 'Vest', skin: 'Skin Tone', face: 'Facial Hair', hair: 'Hair', gloves: 'Gloves', boots: 'Boots',
};

export interface LookOption {
  id: string;
  name: string;
  /** Main colours for the client (swatches, materials). */
  colors?: number[];
}

export const LOOK_OPTIONS: Record<LookSlot, LookOption[]> = {
  camo: [
    { id: 'multicam', name: 'Multicam', colors: [0xa89a78, 0x8b7a58, 0x6f7350, 0x5b4a35, 0xc2b490] },
    { id: 'woodland', name: 'Woodland', colors: [0x6b7046, 0x3f4a2a, 0x5b4630, 0x1e1f18, 0x7c7a52] },
    { id: 'desert', name: 'Desert', colors: [0xc8b48a, 0xa8916a, 0xd8c8a2, 0x8d7656, 0xbfa77c] },
    { id: 'urban', name: 'Urban', colors: [0x8a8d92, 0x5e6166, 0xb4b6ba, 0x3a3c40, 0x9fa2a6] },
    { id: 'ranger', name: 'Ranger Green', colors: [0x4e5440] },
    { id: 'black', name: 'Black Ops', colors: [0x1f2023] },
  ],
  headgear: [
    { id: 'helmet', name: 'FAST Helmet' },
    { id: 'boonie', name: 'Boonie Hat' },
    { id: 'cap', name: 'Ball Cap' },
    { id: 'beanie', name: 'Beanie' },
    { id: 'none', name: 'None' },
  ],
  vest: [
    { id: 'plate', name: 'Plate Carrier' },
    { id: 'rig', name: 'Chest Rig' },
    { id: 'none', name: 'None' },
  ],
  skin: [
    { id: 'light', name: 'Light', colors: [0xe8c2a4] },
    { id: 'fair', name: 'Fair', colors: [0xd6a684] },
    { id: 'medium', name: 'Medium', colors: [0xc08a68] },
    { id: 'tan', name: 'Tan', colors: [0x9c6a48] },
    { id: 'brown', name: 'Brown', colors: [0x7a4e33] },
    { id: 'dark', name: 'Dark', colors: [0x4f3222] },
  ],
  face: [
    { id: 'clean', name: 'Clean Shaven' },
    { id: 'stubble', name: 'Stubble' },
    { id: 'short', name: 'Short Beard' },
    { id: 'beard', name: 'Full Beard' },
    { id: 'goatee', name: 'Goatee' },
    { id: 'moustache', name: 'Moustache' },
    { id: 'chinstrap', name: 'Chin Strap' },
  ],
  hair: [
    { id: 'black', name: 'Black', colors: [0x141110] },
    { id: 'brown', name: 'Brown', colors: [0x3a2618] },
    { id: 'blond', name: 'Blond', colors: [0x9c7c4a] },
    { id: 'red', name: 'Red', colors: [0x7a3a1c] },
    { id: 'grey', name: 'Grey', colors: [0x8a8784] },
  ],
  gloves: [
    { id: 'coyote', name: 'Coyote', colors: [0x8a7a5c] },
    { id: 'black', name: 'Black', colors: [0x1c1c1e] },
    { id: 'olive', name: 'Olive', colors: [0x4e5440] },
    { id: 'none', name: 'Bare Hands' },
  ],
  boots: [
    { id: 'tan', name: 'Desert Tan', colors: [0xa08660] },
    { id: 'black', name: 'Black', colors: [0x1d1c1b] },
    { id: 'brown', name: 'Brown', colors: [0x4a3424] },
  ],
};

export type CharacterLook = Record<LookSlot, string>;

export const DEFAULT_LOOK: CharacterLook = {
  camo: 'multicam', headgear: 'helmet', vest: 'plate', skin: 'medium', face: 'stubble', hair: 'brown', gloves: 'coyote', boots: 'tan',
};

export const lookOption = (slot: LookSlot, id: string): LookOption =>
  LOOK_OPTIONS[slot].find(o => o.id === id) ?? LOOK_OPTIONS[slot].find(o => o.id === DEFAULT_LOOK[slot])!;

/** Fills missing slots and replaces unknown options with defaults (old saves, other clients). */
export function normalizeLook(look: Partial<Record<string, unknown>> | null | undefined): CharacterLook {
  const out = { ...DEFAULT_LOOK };
  for (const slot of LOOK_SLOTS) {
    const v = look?.[slot];
    if (typeof v === 'string' && LOOK_OPTIONS[slot].some(o => o.id === v)) out[slot] = v;
  }
  return out;
}

/** A stable key for caching generated models per look. */
export const lookKey = (look: CharacterLook): string => LOOK_SLOTS.map(s => look[s]).join('|');
