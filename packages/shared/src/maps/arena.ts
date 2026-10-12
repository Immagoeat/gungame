import { mulberry32 } from '../math/random';
import { aabbIntersects, type AABB } from '../physics/aabb';
import { blockToAABB } from './blocks';
import type { Block, BlockMaterial, MapDef } from './types';

/** The original walled yard: pillars, low cover walls and seeded random crates. */
export function createArenaMap(seed = 1337): MapDef {
  const H = 40;
  const rand = mulberry32(seed);
  const blocks: Block[] = [];
  const boxes: AABB[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: BlockMaterial) => {
    const b = { x, y, z, sx, sy, sz, material };
    blocks.push(b);
    boxes.push(blockToAABB(b));
  };

  // Outer walls
  add(0, 0, -H - 0.5, H * 2 + 2, 6, 1, 'wall');
  add(0, 0, H + 0.5, H * 2 + 2, 6, 1, 'wall');
  add(-H - 0.5, 0, 0, 1, 6, H * 2, 'wall');
  add(H + 0.5, 0, 0, 1, 6, H * 2, 'wall');

  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14], [0, -26], [0, 26], [-26, 0], [26, 0]]) {
    add(x, 0, z, 2, 7, 2, 'pillar');
  }

  const lowWalls: [number, number, boolean][] = [
    [-8, 0, true], [8, 0, true], [0, -8, false], [0, 8, false], [-22, -22, false],
    [22, 22, false], [22, -22, true], [-22, 22, true], [-30, 14, false], [30, -14, false],
  ];
  for (const [x, z, alongZ] of lowWalls) add(x, 0, z, alongZ ? 0.6 : 6, 1.25, alongZ ? 6 : 0.6, 'lowWall');

  const crateKinds: BlockMaterial[] = ['crate', 'crateLight', 'crateGreen'];
  for (let i = 0; i < 38; i++) {
    const s = 1.2 + rand() * 1.4;
    const x = (rand() * 2 - 1) * (H - 4);
    const z = (rand() * 2 - 1) * (H - 4);
    if (Math.hypot(x, z) < 6) continue; // keep the spawn clear
    const clearance: AABB = {
      min: { x: x - s / 2 - 0.6, y: 0, z: z - s / 2 - 0.6 },
      max: { x: x + s / 2 + 0.6, y: 10, z: z + s / 2 + 0.6 },
    };
    if (boxes.some(c => aabbIntersects(c, clearance))) continue;
    const kind = crateKinds[i % 3];
    add(x, 0, z, s, s, s, kind);
    if (rand() < 0.3) {
      const s2 = s * 0.7;
      add(x + (rand() - 0.5) * 0.3, s, z + (rand() - 0.5) * 0.3, s2, s2, s2, kind);
    }
  }

  return {
    id: 'arena', name: 'Warehouse Yard', halfSize: H, groundMaterial: 'arenaFloor',
    blocks, props: [], zones: [], playerSpawn: { x: 0, y: 0, z: 0 }, spawnYaw: 0,
  };
}
