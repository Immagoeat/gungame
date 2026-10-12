import { WEAPONS, type WeaponDef, type WeaponId } from './weapons';

/**
 * Weapon customization. Each weapon has slots; each slot offers attachments that change stats.
 * Multipliers are applied to the base weapon; values are chosen so every choice is a trade-off.
 */
export const SLOTS = ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'skin'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_NAMES: Record<Slot, string> = {
  optic: 'Optic', muzzle: 'Muzzle', barrel: 'Barrel', underbarrel: 'Underbarrel',
  magazine: 'Magazine', stock: 'Stock', skin: 'Finish',
};

export interface StatMods {
  damage?: number;
  spreadAim?: number;
  spreadHip?: number;
  recoil?: number;
  magazine?: number;
  reloadTime?: number;
  muzzleVelocity?: number;
  fireInterval?: number;
  aimSpeed?: number;
  loudness?: number;
}

export interface AttachmentDef {
  id: string;
  slot: Slot;
  name: string;
  description: string;
  /** Weapons that can fit it. */
  fits: readonly WeaponId[];
  mods?: StatMods;
  /** Feature flags and fixed values. */
  zoomFov?: number;
  aimFovScale?: number;
  noFlash?: boolean;
  laser?: boolean;
  flashlight?: boolean;
  bipod?: boolean;
  /** Finish colors: main body and accent. */
  colors?: [number, number];
  /** Finish pattern drawn over the body color. */
  pattern?: 'solid' | 'digital' | 'tiger' | 'carbon' | 'damascus';
}

const LONG: WeaponId[] = ['smg', 'shotgun', 'rifle', 'sniper'];
const AUTO: WeaponId[] = ['smg', 'rifle'];
const ALL: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'golden'];

export const ATTACHMENTS: AttachmentDef[] = [
  // Optics
  { id: 'iron', slot: 'optic', name: 'Iron Sights', description: 'Factory sights. Fast and uncluttered.', fits: ['pistol', 'smg', 'shotgun', 'rifle', 'golden'], aimFovScale: 0.82 },
  { id: 'reddot', slot: 'optic', name: 'Red Dot', description: 'Clear dot reticle, slight zoom.', fits: ALL, aimFovScale: 0.75, mods: { spreadAim: 0.9 } },
  { id: 'holo', slot: 'optic', name: 'Holographic', description: 'Wide window with a ring reticle. Quick to pick up targets.', fits: LONG, aimFovScale: 0.72, mods: { spreadAim: 0.88, aimSpeed: 1.05 } },
  { id: 'acog', slot: 'optic', name: '4x Combat Scope', description: 'Magnified optic for mid range. Slower to aim.', fits: ['smg', 'rifle', 'sniper'], zoomFov: 26, mods: { spreadAim: 0.75, aimSpeed: 0.85 } },
  { id: 'scope8x', slot: 'optic', name: '8x Sniper Scope', description: 'High magnification for long shots.', fits: ['rifle', 'sniper'], zoomFov: 14, mods: { spreadAim: 0.6, aimSpeed: 0.7 } },
  // Muzzle
  { id: 'none-muzzle', slot: 'muzzle', name: 'Bare Muzzle', description: 'No muzzle device.', fits: ALL },
  { id: 'suppressor', slot: 'muzzle', name: 'Suppressor', description: 'Much quieter, no muzzle flash, slightly faster bullets. Heavier.', fits: ['pistol', 'smg', 'rifle', 'sniper'], noFlash: true, mods: { loudness: 0.3, muzzleVelocity: 1.04, recoil: 0.9, aimSpeed: 0.92 } },
  { id: 'compensator', slot: 'muzzle', name: 'Compensator', description: 'Vents gas upward to fight recoil. Louder.', fits: ['pistol', 'smg', 'rifle', 'golden'], mods: { recoil: 0.7, loudness: 1.25 } },
  { id: 'flashhider', slot: 'muzzle', name: 'Flash Hider', description: 'Hides most of the flash, small recoil reduction.', fits: AUTO.concat(['sniper']), mods: { recoil: 0.92 }, noFlash: true },
  { id: 'choke', slot: 'muzzle', name: 'Full Choke', description: 'Tightens the pellet spread.', fits: ['shotgun'], mods: { spreadHip: 0.7, spreadAim: 0.6 } },
  // Barrel
  { id: 'standard-barrel', slot: 'barrel', name: 'Standard Barrel', description: 'Balanced.', fits: ALL },
  { id: 'short-barrel', slot: 'barrel', name: 'Short Barrel', description: 'Handles fast, less accurate, lower velocity.', fits: LONG, mods: { aimSpeed: 1.2, spreadHip: 0.85, spreadAim: 1.2, muzzleVelocity: 0.88, damage: 0.95 } },
  { id: 'long-barrel', slot: 'barrel', name: 'Long Barrel', description: 'Higher velocity and accuracy, punches through more cover. Slow to handle.', fits: LONG.concat(['pistol']), mods: { aimSpeed: 0.85, spreadAim: 0.8, muzzleVelocity: 1.15, damage: 1.06 } },
  // Underbarrel
  { id: 'none-under', slot: 'underbarrel', name: 'None', description: 'Clean handguard.', fits: ALL },
  { id: 'vgrip', slot: 'underbarrel', name: 'Vertical Grip', description: 'Steadier under sustained fire.', fits: ['smg', 'rifle', 'shotgun'], mods: { recoil: 0.8, aimSpeed: 0.95 } },
  { id: 'agrip', slot: 'underbarrel', name: 'Angled Grip', description: 'Faster to aim, some recoil control.', fits: ['smg', 'rifle', 'shotgun'], mods: { recoil: 0.9, aimSpeed: 1.12 } },
  { id: 'laser', slot: 'underbarrel', name: 'Laser Sight', description: 'Visible beam. Much better hip fire.', fits: ALL, laser: true, mods: { spreadHip: 0.6 } },
  { id: 'flashlight', slot: 'underbarrel', name: 'Weapon Light', description: 'Bright light. Toggle with F.', fits: ALL, flashlight: true },
  { id: 'bipod', slot: 'underbarrel', name: 'Bipod', description: 'Big recoil and spread reduction when crouched or prone.', fits: ['rifle', 'sniper'], bipod: true, mods: { aimSpeed: 0.9 } },
  // Magazine
  { id: 'standard-mag', slot: 'magazine', name: 'Standard Mag', description: 'Factory magazine.', fits: ALL },
  { id: 'extended-mag', slot: 'magazine', name: 'Extended Mag', description: 'More rounds, slower reload.', fits: ['pistol', 'smg', 'rifle', 'sniper', 'golden'], mods: { magazine: 1.5, reloadTime: 1.15 } },
  { id: 'drum-mag', slot: 'magazine', name: 'Drum', description: 'Huge capacity. Heavy and slow to reload.', fits: AUTO, mods: { magazine: 2.5, reloadTime: 1.45, aimSpeed: 0.85 } },
  { id: 'fast-mag', slot: 'magazine', name: 'Fast Mag', description: 'Quick-release magazine. Fast reloads.', fits: ['pistol', 'smg', 'rifle', 'sniper', 'golden'], mods: { reloadTime: 0.72 } },
  { id: 'tube-ext', slot: 'magazine', name: 'Tube Extension', description: 'Two extra shells.', fits: ['shotgun'], mods: { magazine: 8 / 6, reloadTime: 1.1 } },
  // Stock
  { id: 'standard-stock', slot: 'stock', name: 'Standard Stock', description: 'Balanced.', fits: LONG },
  { id: 'light-stock', slot: 'stock', name: 'Skeleton Stock', description: 'Light and fast, more kick.', fits: LONG, mods: { aimSpeed: 1.15, recoil: 1.12 } },
  { id: 'heavy-stock', slot: 'stock', name: 'Precision Stock', description: 'Absorbs recoil, slower handling.', fits: LONG, mods: { aimSpeed: 0.88, recoil: 0.78, spreadAim: 0.92 } },
  // Finishes
  { id: 'factory', slot: 'skin', name: 'Factory', description: 'The gun as it left the factory: original metal, wood and polymer.', fits: ALL, colors: [0x1d1f22, 0x2c2f33], pattern: 'solid' },
  { id: 'black', slot: 'skin', name: 'Black', description: 'Matte black cerakote.', fits: ALL, colors: [0x1d1f22, 0x2c2f33], pattern: 'solid' },
  { id: 'fde', slot: 'skin', name: 'Flat Dark Earth', description: 'Desert tan.', fits: ALL, colors: [0xb39a72, 0x2c2f33], pattern: 'solid' },
  { id: 'olive', slot: 'skin', name: 'Olive Drab', description: 'Classic military green.', fits: ALL, colors: [0x55603f, 0x2c2f33], pattern: 'solid' },
  { id: 'gray', slot: 'skin', name: 'Wolf Gray', description: 'Cool gray.', fits: ALL, colors: [0x6c7177, 0x2c2f33], pattern: 'solid' },
  { id: 'digital', slot: 'skin', name: 'Digital Camo', description: 'Pixelated woodland pattern.', fits: ALL, colors: [0x5b6b45, 0x2f3826], pattern: 'digital' },
  { id: 'tiger', slot: 'skin', name: 'Tiger Stripe', description: 'Jungle stripes.', fits: ALL, colors: [0x7a6a3a, 0x1e2414], pattern: 'tiger' },
  { id: 'carbon', slot: 'skin', name: 'Carbon Fiber', description: 'Woven carbon.', fits: ALL, colors: [0x222326, 0x3a3c40], pattern: 'carbon' },
  { id: 'damascus', slot: 'skin', name: 'Damascus', description: 'Folded steel waves.', fits: ALL, colors: [0x8a8f96, 0x3a3e44], pattern: 'damascus' },
  { id: 'gold', slot: 'skin', name: 'Gold', description: 'Solid gold. Purely for show.', fits: ALL, colors: [0xf2c230, 0x8a6a1a], pattern: 'solid' },
];

export type Loadout = Partial<Record<Slot, string>>;

/** Which slots a weapon offers. */
export const WEAPON_SLOTS: Record<WeaponId, Slot[]> = {
  pistol: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'skin'],
  smg: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'skin'],
  shotgun: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'skin'],
  rifle: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'skin'],
  sniper: ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'stock', 'skin'],
  golden: ['optic', 'muzzle', 'underbarrel', 'magazine', 'skin'],
};

/** What each weapon comes with. */
export const DEFAULT_LOADOUTS: Record<WeaponId, Loadout> = {
  pistol: { optic: 'iron', muzzle: 'none-muzzle', barrel: 'standard-barrel', underbarrel: 'none-under', magazine: 'standard-mag', skin: 'factory' },
  smg: { optic: 'iron', muzzle: 'none-muzzle', barrel: 'standard-barrel', underbarrel: 'none-under', magazine: 'standard-mag', stock: 'standard-stock', skin: 'factory' },
  shotgun: { optic: 'iron', muzzle: 'none-muzzle', barrel: 'standard-barrel', underbarrel: 'none-under', magazine: 'standard-mag', stock: 'standard-stock', skin: 'factory' },
  rifle: { optic: 'iron', muzzle: 'none-muzzle', barrel: 'standard-barrel', underbarrel: 'none-under', magazine: 'standard-mag', stock: 'standard-stock', skin: 'factory' },
  sniper: { optic: 'scope8x', muzzle: 'none-muzzle', barrel: 'standard-barrel', underbarrel: 'none-under', magazine: 'standard-mag', stock: 'standard-stock', skin: 'factory' },
  golden: { optic: 'iron', muzzle: 'none-muzzle', underbarrel: 'none-under', magazine: 'standard-mag', skin: 'gold' },
};

export const getAttachment = (id: string | undefined): AttachmentDef | undefined => ATTACHMENTS.find(a => a.id === id);

export const attachmentsFor = (weapon: WeaponId, slot: Slot): AttachmentDef[] =>
  ATTACHMENTS.filter(a => a.slot === slot && a.fits.includes(weapon));

/** Fills missing or invalid slots with the weapon's defaults. */
export function normalizeLoadout(weapon: WeaponId, loadout: Loadout = {}): Loadout {
  const out: Loadout = {};
  for (const slot of WEAPON_SLOTS[weapon]) {
    const want = getAttachment(loadout[slot]);
    out[slot] = want && want.slot === slot && want.fits.includes(weapon) ? want.id : DEFAULT_LOADOUTS[weapon][slot];
  }
  return out;
}

/** The weapon's stats with a loadout applied. */
export function applyAttachments(weapon: WeaponId, loadout: Loadout = {}): WeaponDef {
  const base: WeaponDef = WEAPONS[weapon];
  const full = normalizeLoadout(weapon, loadout);
  const w: WeaponDef = { ...base, aimSpeed: 1, loudness: 1, flash: true, aimFovScale: 0.82, loadout: full };
  const m = (key: keyof StatMods, value: number | undefined) => value ?? (key === 'magazine' ? 1 : 1);
  for (const slot of WEAPON_SLOTS[weapon]) {
    const a = getAttachment(full[slot]);
    if (!a) continue;
    const mods = a.mods ?? {};
    w.damage *= m('damage', mods.damage);
    w.spreadAim *= m('spreadAim', mods.spreadAim);
    w.spreadHip *= m('spreadHip', mods.spreadHip);
    w.recoil *= m('recoil', mods.recoil);
    w.magazine *= m('magazine', mods.magazine);
    w.reloadTime *= m('reloadTime', mods.reloadTime);
    w.muzzleVelocity *= m('muzzleVelocity', mods.muzzleVelocity);
    w.fireInterval *= m('fireInterval', mods.fireInterval);
    w.aimSpeed! *= m('aimSpeed', mods.aimSpeed);
    w.loudness! *= m('loudness', mods.loudness);
    if (a.zoomFov !== undefined) w.zoomFov = a.zoomFov;
    else if (a.slot === 'optic') w.zoomFov = undefined;
    if (a.aimFovScale !== undefined) w.aimFovScale = a.aimFovScale;
    if (a.noFlash) w.flash = false;
    if (a.laser) w.laser = true;
    if (a.flashlight) w.flashlight = true;
    if (a.bipod) w.bipod = true;
  }
  w.magazine = Math.max(1, Math.round(w.magazine));
  return w;
}
