import { createArenaMap } from './arena';
import { createMansionMap } from './mansion';
import type { MapDef } from './types';

/** Every playable map. Add new maps here so client and server can load them by id. */
export const MAPS = {
  arena: createArenaMap,
  mansion: createMansionMap,
} satisfies Record<string, () => MapDef>;

export type MapId = keyof typeof MAPS;

export const createMap = (id: MapId): MapDef => MAPS[id]();
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && v in MAPS;

export * from './types';
export * from './materials';
export * from './furniture';
export * from './blocks';
export * from './builder';
export { createArenaMap } from './arena';
export { createMansionMap, MANSION_LEVELS } from './mansion';
