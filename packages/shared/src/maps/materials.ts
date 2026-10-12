/** Every surface kind a block can have. The client maps each to a look; the server only cares about solidity. */
export const BLOCK_MATERIALS = [
  // arena
  'arenaFloor', 'wall', 'pillar', 'lowWall', 'crate', 'crateLight', 'crateGreen',
  // outdoors
  'grass', 'hedge', 'asphalt', 'stone', 'poolTile', 'water', 'court', 'courtLine', 'fence', 'ironGate', 'palmTrunk',
  // building shell
  'marble', 'wood', 'carpet', 'tile', 'plaster', 'stucco', 'ceiling', 'concrete', 'roof', 'glass', 'helipad',
  'trim', 'windowFrame', 'cobble', 'travertine',
  // furniture and fittings
  'darkWood', 'metal', 'steel', 'gold', 'fabric', 'leather', 'books', 'screen', 'serverRack', 'painting', 'carPaint', 'rubber',
] as const;

export type BlockMaterial = (typeof BLOCK_MATERIALS)[number];

/** Materials you can walk and shoot through. */
export const NON_SOLID_MATERIALS: ReadonlySet<BlockMaterial> = new Set(['water']);

/** Materials that don't block line of sight. */
export const SEE_THROUGH_MATERIALS: ReadonlySet<BlockMaterial> = new Set(['glass', 'water', 'fence', 'ironGate']);

export const isSolid = (m: BlockMaterial) => !NON_SOLID_MATERIALS.has(m);
export const isSeeThrough = (m: BlockMaterial) => SEE_THROUGH_MATERIALS.has(m);
