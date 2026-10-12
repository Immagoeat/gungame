import { describe, expect, it } from 'vitest';
import { footprintBlocked } from '../physics/aabb';
import { createArenaMap } from './arena';
import { mapColliders } from './blocks';

describe('arena map', () => {
  it('is deterministic for a seed', () => {
    expect(createArenaMap(42)).toEqual(createArenaMap(42));
  });

  it('keeps the player spawn clear', () => {
    const map = createArenaMap();
    const { x, z } = map.playerSpawn;
    expect(footprintBlocked(x, z, 1, mapColliders(map))).toBe(false);
  });
});
