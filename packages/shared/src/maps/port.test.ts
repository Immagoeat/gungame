import { describe, expect, it } from 'vitest';
import { NavGrid } from '../nav/NavGrid';
import { Buttons, STANCES, stepMovement, type Mover } from '../physics/movement';
import { PLAYER_RADIUS } from '../constants';
import { blockToAABB, mapWater } from './blocks';
import { isSolid } from './materials';
import { createPortMap, FENCE, HARBOUR_LEVEL, OPS_UPPER, QUAY } from './port';

const map = createPortMap();
const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
const water = mapWater(map);
const nav = new NavGrid(colliders, { bounds: { minX: -130, maxX: 130, minZ: -130, maxZ: 138 }, water });
const reach = (to: { x: number; y: number; z: number }, label: string, radius = 1.5) => {
  const n = nav.nearest(to, radius);
  expect(n, `${label} isn't walkable`).toBeGreaterThanOrEqual(0);
  expect(nav.findPath(map.playerSpawn, nav.point(n), 400000), `${label} can't be reached from the car park`).not.toBeNull();
};

describe('the Port', () => {
  it('starts you standing in the car park, outside the fence', () => {
    expect(nav.nearest(map.playerSpawn, 0.6)).toBeGreaterThanOrEqual(0);
    expect(map.playerSpawn.z).toBeGreaterThan(FENCE);
  });

  const marker = (id: string) => map.props.find(p => p.kind === 'marker' && p.id === id) as { x: number; y: number; z: number };
  const clue = (id: string) => map.props.find(p => p.kind === 'clue' && p.id === id) as { x: number; y: number; z: number };
  it('reaches Nadia in the canteen', () => {
    const n = map.props.find(p => p.kind === 'character' && p.id === 'nadia') as { x: number; y: number; z: number };
    reach({ x: n.x, y: 0, z: n.z - 1.2 }, 'beside Nadia');
  });
  for (const id of ['p-booking', 'p-loadplan', 'p-xray', 'p-overheard']) {
    it(`reaches the lead ${id}`, () => {
      const c = clue(id);
      reach({ x: c.x, y: c.y > OPS_UPPER ? OPS_UPPER : 0, z: c.z }, id, 1.8);
    });
  }
  it('reaches the charge spot on the right box, inside the compound', () => {
    const c = marker('charge');
    reach({ x: c.x - 0.6, y: 0, z: c.z }, 'the charge spot');
  });
  it('reaches every set of clothes, and the van', () => {
    for (const p of map.props) if (p.kind === 'clue' && p.model === 'uniform') reach({ x: p.x, y: p.y > 3 ? OPS_UPPER : 0, z: p.z }, p.id, 1.8);
    const v = marker('extract');
    reach({ x: v.x, y: 0, z: v.z }, 'the van');
  });
  it("reaches Nadia's bag on the evidence rack", () => {
    const c = clue('p-charge');
    reach({ x: c.x + 0.8, y: 0, z: c.z }, 'the evidence rack');
  });
  it('lets you out through the hole in the west fence, to where the van waits', () => {
    const inside = { x: -108, y: 0, z: 54 }, out = marker('extract-west');
    const path = nav.findPath(inside, { x: out.x, y: 0, z: out.z }, 400000)!;
    expect(path, 'no way out at the west end').not.toBeNull();
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    expect(len, 'the way out goes round by the gates, not through the hole').toBeLessThan(25);
    for (const id of ['gatecheck-1', 'gatecheck-2']) expect(nav.nearest(marker(id), 0.9), id).toBeGreaterThanOrEqual(0);
  });
  it('has every guard on walkable ground, posts and routes', () => {
    for (const p of map.props) {
      if (p.kind !== 'guard') continue;
      for (const q of [p, ...(p.route ?? [])]) expect(nav.nearest(q, 0.9), `${p.id} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('keeps the fence closed except at the gates (and the hole)', () => {
    // Straight through the fence anywhere else is blocked: the path from the car park in goes through a gap.
    const path = nav.findPath(map.playerSpawn, { x: 40, y: 0, z: 40 }, 400000)!;
    const crossing = path.findIndex((p, i) => i > 0 && (path[i - 1].z - FENCE) * (p.z - FENCE) <= 0);
    expect(crossing).toBeGreaterThan(0);
    const at = path[crossing];
    const near = (a: number, b: number) => at.x >= a - 1 && at.x <= b + 1;
    expect(near(41, 42.4) || near(-112, -110.6) || near(-8.2, 8.2), `crosses the fence at ${at.x.toFixed(1)}`).toBe(true);
  });
});

describe('the Port on foot', () => {
  const body = (x: number, y: number, z: number): Mover => ({
    pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: PLAYER_RADIUS, height: STANCES.stand.height, onGround: true, canStep: true,
    stance: 'stand', swimming: false, submerged: 0, waterLevel: -Infinity, floor: -Infinity,
  });
  it('walks up and down the Ops stairs', () => {
    for (const dt of [1 / 60, 0.05]) {
      const up = body(-101.8, 0, 49.05);
      for (let t = 0; t < 4 && up.pos.x < -95.4; t += dt) stepMovement(up, { buttons: Buttons.Forward, yaw: -Math.PI / 2 }, dt, colliders, water);
      for (let t = 0; t < 1; t += 1 / 60) stepMovement(up, { buttons: 0, yaw: 0 }, 1 / 60, colliders, water);
      expect(up.pos.y, `top (dt ${dt})`).toBeCloseTo(OPS_UPPER, 1);
      const down = body(-95.3, OPS_UPPER, 49.05);
      for (let t = 0; t < 4 && down.pos.x > -101.6; t += dt) stepMovement(down, { buttons: Buttons.Forward, yaw: Math.PI / 2 }, dt, colliders, water);
      for (let t = 0; t < 1; t += 1 / 60) stepMovement(down, { buttons: 0, yaw: 0 }, 1 / 60, colliders, water);
      expect(down.pos.y, `bottom (dt ${dt})`).toBeCloseTo(0, 1);
    }
  });
  it('random running and jumping never pops you up, shoves you, or puts you in the water', () => {
    let seed = 5;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let runs = 0;
    while (runs < 120) {
      const start = nav.randomNear({ x: -110 + rand() * 220, y: rand() < 0.1 ? OPS_UPPER : 0, z: QUAY + rand() * 110 }, 8, rand);
      if (!start) continue;
      runs++;
      const b = body(start.x, start.y, start.z);
      let yaw = rand() * Math.PI * 2, buttons = 0;
      for (let k = 0; k < 360; k++) {
        if (k % 20 === 0) {
          yaw += (rand() - 0.5) * 2.5;
          buttons = Buttons.Forward | (rand() < 0.4 ? Buttons.Sprint : 0) | (rand() < 0.35 ? Buttons.Jump : 0) | (rand() < 0.15 ? Buttons.Crouch : 0);
        }
        const before = { ...b.pos };
        stepMovement(b, { buttons, yaw }, rand() < 0.25 ? 0.05 : 1 / 60, colliders, water);
        const where = `run ${runs} from ${before.x.toFixed(2)},${before.y.toFixed(2)},${before.z.toFixed(2)} to ${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`;
        expect(b.pos.y - before.y, `popped up: ${where}`).toBeLessThan(1.2);
        expect(Math.hypot(b.pos.x - before.x, b.pos.z - before.z), `shoved: ${where}`).toBeLessThan(0.9);
        expect(b.pos.y > HARBOUR_LEVEL && b.pos.z > QUAY - 0.5 && Math.abs(b.pos.x) < 123, `off the map: ${where}`).toBe(true);
      }
    }
  });
});
