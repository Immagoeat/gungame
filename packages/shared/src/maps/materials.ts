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
  // ships
  'hull', 'teak', 'deckPaint', 'paneling', 'casinoCarpet', 'brass',
  // never drawn: keeps bodies in (over a ship's rail, say) without stopping bullets or sight
  'barrier',
] as const;

export type BlockMaterial = (typeof BLOCK_MATERIALS)[number];

/**
 * Materials you can walk and shoot through. Trim (skirting, architraves, sills) is a few centimetres
 * proud of the wall it's on: the wall stops you, and you don't ride up the skirting hugging it.
 */
export const NON_SOLID_MATERIALS: ReadonlySet<BlockMaterial> = new Set(['water', 'trim']);

/** Materials that don't block line of sight. */
export const SEE_THROUGH_MATERIALS: ReadonlySet<BlockMaterial> = new Set(['glass', 'water', 'fence', 'ironGate', 'barrier']);

export const isSolid = (m: BlockMaterial) => !NON_SOLID_MATERIALS.has(m);
export const isSeeThrough = (m: BlockMaterial) => SEE_THROUGH_MATERIALS.has(m);
