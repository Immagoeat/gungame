import { describe, expect, it } from 'vitest';
import { blockToAABB, isSolid, mapWater } from '../maps';
import { createMansionMap, MANSION_LEVELS } from '../maps/mansion';
import { NavGrid } from './NavGrid';

const [B, G, F2, F3] = MANSION_LEVELS;

describe('nav grid (mansion)', () => {
  const map = createMansionMap();
  const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
  const t0 = performance.now();
  const nav = new NavGrid(colliders, { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 58 }, water: mapWater(map) });
  const buildMs = performance.now() - t0;

  it('builds quickly', () => {
    expect(nav.nodeCount).toBeGreaterThan(10000);
    expect(buildMs).toBeLessThan(4000);
  });

  it('walks from the front gate to the penthouse, the security room and the roof terrace', () => {
    const gate = { x: 0, y: G, z: 41 };
    for (const to of [{ x: 0, y: F3, z: 0 }, { x: 15, y: B, z: 0 }, { x: -12, y: F3, z: -5 }, { x: 14, y: F2, z: -12 }]) {
      const path = nav.findPath(gate, to);
      expect(path, JSON.stringify(to)).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.abs(end.y - to.y)).toBeLessThan(0.5);
    }
  });

  it("doesn't walk through the pool", () => {
    expect(nav.nearest({ x: 0, y: G - 1.3, z: -32 }, 0.5)).toBe(-1);
  });
});

describe('mansion security team', () => {
  const map = createMansionMap();
  const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
  const nav = new NavGrid(colliders, { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 58 }, water: mapWater(map) });

  it('every guard stands, and patrols, on walkable ground', () => {
    for (const p of map.props) {
      if (p.kind !== 'guard') continue;
      const points = [p, ...(p.route ?? [])];
      for (const q of points) {
        const n = nav.nearest(q, 0.8);
        expect(n, `${p.id} at ${q.x},${q.y},${q.z}`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(nav.point(n).y - q.y), `${p.id} height at ${q.x},${q.z}`).toBeLessThan(0.6);
      }
      const route = p.route ?? [];
      for (let i = 0; i < route.length; i++) {
        expect(nav.findPath(route[i], route[(i + 1) % route.length]), `${p.id} leg ${i}`).not.toBeNull();
      }
    }
  });

  it('the hostage and the extraction point can be reached from the start', () => {
    const start = { x: 0.9, y: G, z: 35.2 };
    for (const p of map.props) {
      if (p.kind === 'marker' && p.id === 'extract') expect(nav.findPath(start, p)).not.toBeNull();
      if (p.kind === 'hostage') expect(nav.findPath(start, { x: p.x + 1, y: p.y, z: p.z })).not.toBeNull();
    }
  });

  it('the garden door lets you in from the west lawn to the library', () => {
    const path = nav.findPath({ x: -30, y: G, z: -1 }, { x: -18, y: G, z: -1 });
    expect(path).not.toBeNull();
    // Straight through the door, not round the house.
    expect(path!.reduce((n, p, i) => n + (i ? Math.hypot(p.x - path![i - 1].x, p.z - path![i - 1].z) : 0), 0)).toBeLessThan(16);
  });

  it('every lead can be walked up to', () => {
    const start = { x: 0.9, y: G, z: 35.2 };
    for (const p of map.props) {
      if (p.kind !== 'clue') continue;
      // Clues sit on furniture: somewhere on the floor within reach of it.
      const floor = MANSION_LEVELS.filter(l => l <= p.y + 0.01).at(-1)!;
      const n = nav.nearest({ x: p.x, y: floor, z: p.z }, 1.4);
      expect(n, p.id).toBeGreaterThanOrEqual(0);
      expect(nav.findPath(start, nav.point(n)), p.id).not.toBeNull();
    }
  });
});

describe('chapter 1 setup', () => {
  const map = createMansionMap();
  it('has everything the mission needs', () => {
    const guards = map.props.filter(p => p.kind === 'guard');
    expect(guards.find(g => g.kind === 'guard' && g.carries === 'keycard')).toBeTruthy();
    expect(map.props.some(p => p.kind === 'hostage')).toBe(true);
    for (const id of ['extract', 'terminal', 'reinforce-gate']) expect(map.props.some(p => p.kind === 'marker' && p.id === id), id).toBe(true);
    expect(map.props.filter(p => p.kind === 'door' && p.lock === 'keycard').length).toBe(2);
    expect(new Set(guards.map(g => g.kind === 'guard' && g.id)).size).toBe(guards.length);
    // Enough leads to find Reyes (three are needed, plus the terminal's camera log).
    expect(map.props.filter(p => p.kind === 'clue').length).toBeGreaterThanOrEqual(4);
  });
});
