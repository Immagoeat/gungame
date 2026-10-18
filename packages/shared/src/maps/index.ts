import { separateCoplanarFaces } from './coplanar';
import { createArenaMap } from './arena';
import { createAureliaMap } from './aurelia';
import { createMansionMap } from './mansion';
import { createPortMap } from './port';
import type { MapDef } from './types';

/** Every playable map. Add new maps here so client and server can load them by id. */
export const MAPS = {
  arena: createArenaMap,
  mansion: createMansionMap,
  aurelia: createAureliaMap,
  port: createPortMap,
} satisfies Record<string, () => MapDef>;

export type MapId = keyof typeof MAPS;

/** Builds a map (with coplanar faces pulled apart, so nothing z-fights). */
export const createMap = (id: MapId): MapDef => separateCoplanarFaces(MAPS[id]());
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && v in MAPS;

export * from './types';
export * from './materials';
export * from './furniture';
export * from './blocks';
export * from './builder';
export { createArenaMap } from './arena';
export { AURELIA_DECKS, AURELIA_HULL_WINDOWS, createAureliaMap, halfBeam, SEA_LEVEL, SHIP } from './aurelia';
export { createMansionMap, MANSION_LEVELS, NEIGHBOR_DRIVES, STREET_LAMPS, STREET_PALMS } from './mansion';
export { createPortMap, FENCE, HARBOUR_LEVEL, MERIDIAN_BOXES, OPS_UPPER, QUAY, TARGET_BOX, TIER } from './port';
