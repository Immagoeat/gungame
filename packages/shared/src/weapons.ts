/** How a weapon looks in first person. Units are meters. */
export interface WeaponModel {
  color: number;
  length: number;
  width: number;
  height: number;
  barrel: number;
  stock?: boolean;
  scope?: boolean;
  gold?: boolean;
}

export interface WeaponDef {
  name: string;
  damage: number;
  headshotMultiplier: number;
  /** Seconds between shots. */
  fireInterval: number;
  magazine: number;
  reloadTime: number;
  /** Cone half-angle in radians when aiming / from the hip. */
  spreadAim: number;
  spreadHip: number;
  pellets: number;
  automatic: boolean;
  /** Camera kick in radians per shot. */
  recoil: number;
  /** Field of view while aiming; weapons with a value here are scoped. */
  zoomFov?: number;
  model: WeaponModel;
  /** Bullet speed leaving the barrel (m/s); drives travel time and wall penetration. */
  muzzleVelocity: number;
  /** Synthesized shot: low-pass cutoff (Hz) and decay (s). */
  sound: { cutoff: number; decay: number };
  /** Set by attachments (see attachments.ts); all optional with neutral defaults. */
  /** How quickly the weapon comes up to aim (1 = normal). */
  aimSpeed?: number;
  /** Shot volume (1 = normal); suppressors lower it. */
  loudness?: number;
  /** Show a muzzle flash (false when suppressed). */
  flash?: boolean;
  laser?: boolean;
  flashlight?: boolean;
  /** Recoil and spread reduction when crouched or prone. */
  bipod?: boolean;
  /** Field of view while aiming through a non-magnified optic, as a fraction of normal. */
  aimFovScale?: number;
  /** Attachments fitted, by slot (filled in by applyAttachments). */
  loadout?: Partial<Record<string, string>>;
}

export const WEAPONS = {
  pistol: {
    name: 'Pistol', muzzleVelocity: 370, damage: 34, headshotMultiplier: 2.2, fireInterval: 0.16, magazine: 12, reloadTime: 1.1,
    spreadAim: 0.010, spreadHip: 0.022, pellets: 1, automatic: false, recoil: 0.030,
    model: { color: 0x2b2f36, length: 0.22, width: 0.06, height: 0.11, barrel: 0.08 },
    sound: { cutoff: 2600, decay: 0.18 },
  },
  smg: {
    name: 'SMG', muzzleVelocity: 400, damage: 19, headshotMultiplier: 2.2, fireInterval: 0.065, magazine: 32, reloadTime: 1.5,
    spreadAim: 0.022, spreadHip: 0.040, pellets: 1, automatic: true, recoil: 0.011,
    model: { color: 0x3a3f2e, length: 0.36, width: 0.07, height: 0.12, barrel: 0.10, stock: true },
    sound: { cutoff: 3200, decay: 0.12 },
  },
  shotgun: {
    name: 'Shotgun', muzzleVelocity: 410, damage: 15, headshotMultiplier: 1.5, fireInterval: 0.85, magazine: 6, reloadTime: 2.0,
    spreadAim: 0.060, spreadHip: 0.085, pellets: 10, automatic: false, recoil: 0.090,
    model: { color: 0x5a3d26, length: 0.50, width: 0.08, height: 0.11, barrel: 0.30, stock: true },
    sound: { cutoff: 1500, decay: 0.35 },
  },
  rifle: {
    name: 'Assault Rifle', muzzleVelocity: 900, damage: 27, headshotMultiplier: 2.2, fireInterval: 0.095, magazine: 30, reloadTime: 1.8,
    spreadAim: 0.008, spreadHip: 0.030, pellets: 1, automatic: true, recoil: 0.016,
    model: { color: 0x23272d, length: 0.52, width: 0.07, height: 0.13, barrel: 0.18, stock: true },
    sound: { cutoff: 2200, decay: 0.2 },
  },
  sniper: {
    name: 'Sniper', muzzleVelocity: 950, damage: 150, headshotMultiplier: 2.2, fireInterval: 1.2, magazine: 5, reloadTime: 2.4,
    spreadAim: 0, spreadHip: 0.090, pellets: 1, automatic: false, recoil: 0.070, zoomFov: 18,
    model: { color: 0x2e3b2a, length: 0.62, width: 0.07, height: 0.12, barrel: 0.38, stock: true, scope: true },
    sound: { cutoff: 1200, decay: 0.5 },
  },
  golden: {
    name: 'Golden Gun', muzzleVelocity: 600, damage: 250, headshotMultiplier: 2.2, fireInterval: 0.45, magazine: 7, reloadTime: 1.2,
    spreadAim: 0.004, spreadHip: 0.015, pellets: 1, automatic: false, recoil: 0.050,
    model: { color: 0xffc83d, length: 0.26, width: 0.065, height: 0.12, barrel: 0.12, gold: true },
    sound: { cutoff: 1800, decay: 0.3 },
  },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

export const getWeapon = (id: WeaponId): WeaponDef => WEAPONS[id];
export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && v in WEAPONS;
