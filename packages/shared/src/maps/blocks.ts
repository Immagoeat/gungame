import type { AABB } from '../physics/aabb';
import { isSolid } from './materials';
import type { Block, MapDef, ZoneDef } from './types';
import type { Vec3 } from '../math/vec';

export function blockToAABB(b: Block): AABB {
  return {
    min: { x: b.x - b.sx / 2, y: b.y, z: b.z - b.sz / 2 },
    max: { x: b.x + b.sx / 2, y: b.y + b.sy, z: b.z + b.sz / 2 },
  };
}

/** Volumes of water you can wade or swim in. */
export const mapWater = (map: MapDef): AABB[] => map.blocks.filter(b => b.material === 'water').map(blockToAABB);

/** Collision boxes for every solid block. */
export const mapColliders = (map: MapDef): AABB[] => map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);

/** First zone containing the point, or null. Zones listed earlier take priority. */
export function zoneAt(map: MapDef, p: Vec3): ZoneDef | null {
  for (const z of map.zones) {
    if (p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z) return z;
  }
  return null;
}
