import type { BlockMaterial } from './maps/materials';
import type { Vec3 } from './math/vec';
import type { AABB } from './physics/aabb';

/**
 * Bullet penetration model. Each material has a resistance: the speed (m/s) a bullet loses per
 * centimetre it travels through it. A bullet that drops below MIN_BULLET_SPEED stops inside.
 *
 * Reference points: an interior drywall partition (20 cm, hollow) costs ~120 m/s, so pistols get
 * through one or two; a stucco exterior wall costs ~520 m/s, so only rifles get through;
 * floor slabs (~1000 m/s) and steel stop everything.
 */
export const PENETRATION_RESISTANCE: Record<BlockMaterial, number> = {
  arenaFloor: 50, wall: 35, pillar: 35, lowWall: 30, crate: 6, crateLight: 6, crateGreen: 6,
  grass: 60, hedge: 1, asphalt: 60, stone: 40, poolTile: 40, water: 3.5, court: 50, courtLine: 50,
  fence: 0.5, ironGate: 30, palmTrunk: 10,
  marble: 40, wood: 8, carpet: 3, tile: 30, plaster: 6, stucco: 20, ceiling: 30, concrete: 40, roof: 30,
  glass: 4, helipad: 40, trim: 6, windowFrame: 40, cobble: 60, travertine: 40,
  darkWood: 9, metal: 90, steel: 150, gold: 200, fabric: 2, leather: 3, books: 12, screen: 20,
  serverRack: 40, painting: 3, carPaint: 40, rubber: 5,
};

/** Resistance of a body (per cm). A torso is roughly 30 cm of it. */
export const FLESH_RESISTANCE = 6;
export const FLESH_THICKNESS = 0.3;
/** Below this speed a bullet is spent. */
export const MIN_BULLET_SPEED = 120;
/** Air drag: fraction of speed lost per second. */
export const BULLET_DRAG = 0.12;
export const BULLET_GRAVITY = 9.8;

export interface BoxHit {
  /** Index into the boxes array. */
  box: number;
  /** Distances along the ray where it enters and leaves the box. */
  tIn: number;
  tOut: number;
  normalIn: Vec3;
  normalOut: Vec3;
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * Every box the ray passes through within maxT, sorted by entry distance.
 * `dir` must be normalized. A ray starting inside a box reports tIn = 0.
 */
export function raycastBoxes(origin: Vec3, dir: Vec3, maxT: number, boxes: readonly AABB[]): BoxHit[] {
  const hits: BoxHit[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let tMin = -Infinity;
    let tMax = Infinity;
    let inAxis = 0, inSign = 0, outAxis = 0, outSign = 0;
    let miss = false;
    for (let a = 0; a < 3; a++) {
      const k = AXES[a];
      const o = origin[k];
      const d = dir[k];
      if (Math.abs(d) < 1e-12) {
        if (o < b.min[k] || o > b.max[k]) { miss = true; break; }
        continue;
      }
      let t0 = (b.min[k] - o) / d;
      let t1 = (b.max[k] - o) / d;
      let s0 = -1, s1 = 1; // face normals for the near/far planes
      if (t0 > t1) { [t0, t1] = [t1, t0]; [s0, s1] = [1, -1]; }
      if (t0 > tMin) { tMin = t0; inAxis = a; inSign = s0; }
      if (t1 < tMax) { tMax = t1; outAxis = a; outSign = s1; }
      if (tMin > tMax) { miss = true; break; }
    }
    if (miss || tMax < 0 || tMin > maxT) continue;
    const normalIn = { x: 0, y: 0, z: 0 };
    const normalOut = { x: 0, y: 0, z: 0 };
    normalIn[AXES[inAxis]] = inSign;
    normalOut[AXES[outAxis]] = outSign;
    hits.push({ box: i, tIn: Math.max(0, tMin), tOut: tMax, normalIn, normalOut });
  }
  return hits.sort((a, b) => a.tIn - b.tIn);
}

/** Speed after passing through `thickness` meters of a material, or 0 if the bullet stops inside. */
export function exitSpeed(speed: number, resistancePerCm: number, thickness: number): number {
  const v = speed - resistancePerCm * thickness * 100;
  return v > MIN_BULLET_SPEED ? v : 0;
}

/**
 * Chance a bullet glances off instead of biting in. Only hard materials ricochet, and only at
 * grazing angles. `cosIncidence` is |dot(direction, surface normal)| (1 = head-on).
 */
export function ricochetChance(cosIncidence: number, resistancePerCm: number): number {
  if (resistancePerCm < 20) return 0;
  const graze = 1 - cosIncidence;
  if (graze < 0.82) return 0;
  return Math.min(0.9, (graze - 0.82) * 5 * Math.min(1, resistancePerCm / 60));
}

/** Damage multiplier for a bullet that has slowed from its muzzle velocity. */
export const damageScale = (speed: number, muzzleVelocity: number) => Math.max(0, Math.min(1, speed / muzzleVelocity));
