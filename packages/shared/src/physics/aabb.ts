import type { Vec3 } from '../math/vec';

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z;
}

/** True if a vertical cylinder footprint (as a square of half-size r) at x,z overlaps any box. */
export function footprintBlocked(x: number, z: number, r: number, boxes: readonly AABB[]): boolean {
  return boxes.some(b => x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z);
}
