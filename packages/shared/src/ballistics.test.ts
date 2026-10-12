import { describe, expect, it } from 'vitest';
import { exitSpeed, PENETRATION_RESISTANCE as R, raycastBoxes, ricochetChance } from './ballistics';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

describe('raycastBoxes', () => {
  it('finds entry, exit and face normals, sorted by distance', () => {
    const boxes = [box(5, -1, -1, 6, 1, 1), box(2, -1, -1, 2.2, 1, 1)];
    const hits = raycastBoxes({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 100, boxes);
    expect(hits.map(h => h.box)).toEqual([1, 0]);
    expect(hits[0].tIn).toBeCloseTo(2);
    expect(hits[0].tOut).toBeCloseTo(2.2);
    expect(hits[0].normalIn).toEqual({ x: -1, y: 0, z: 0 });
    expect(hits[0].normalOut).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('ignores boxes behind the ray or beyond maxT', () => {
    const boxes = [box(-3, -1, -1, -2, 1, 1), box(50, -1, -1, 51, 1, 1)];
    expect(raycastBoxes({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 10, boxes)).toEqual([]);
  });
});

describe('penetration', () => {
  it('a pistol round passes an interior wall but not an exterior one', () => {
    const afterDrywall = exitSpeed(370, R.plaster, 0.2);
    expect(afterDrywall).toBeGreaterThan(200);
    const afterExterior = exitSpeed(exitSpeed(370, R.plaster, 0.2), R.stucco, 0.2);
    expect(afterExterior).toBe(0);
  });

  it('a rifle round passes an exterior wall, nothing passes a floor slab', () => {
    expect(exitSpeed(exitSpeed(900, R.plaster, 0.2), R.stucco, 0.2)).toBeGreaterThan(300);
    expect(exitSpeed(exitSpeed(950, R.marble, 0.06), R.ceiling, 0.24)).toBe(0);
  });

  it('only hard surfaces at grazing angles ricochet', () => {
    expect(ricochetChance(1, R.steel)).toBe(0);
    expect(ricochetChance(0.05, R.plaster)).toBe(0);
    expect(ricochetChance(0.05, R.steel)).toBeGreaterThan(0.3);
  });
});
