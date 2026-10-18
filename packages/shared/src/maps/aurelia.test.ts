import { describe, expect, it } from 'vitest';
import { NavGrid } from '../nav/NavGrid';
import { blockToAABB, mapWater } from './blocks';
import { isSolid } from './materials';
import { AURELIA_DECKS, createAureliaMap, halfBeam, SEA_LEVEL, SHIP } from './aurelia';
import { Buttons, STANCES, stepMovement, type Mover } from '../physics/movement';
import { PLAYER_RADIUS } from '../constants';

const [D2, D3, D4, D5, D6, D7] = AURELIA_DECKS;

describe('the Aurelia', () => {
  const map = createAureliaMap();
  const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
  const nav = new NavGrid(colliders, { bounds: { minX: -85, maxX: 85, minZ: -85, maxZ: 93 }, water: mapWater(map) });

  it('starts you standing in your stateroom', () => {
    const s = map.playerSpawn;
    expect(nav.nearest(s, 0.6)).toBeGreaterThanOrEqual(0);
    expect(map.zones.find(z => s.x >= z.min.x && s.x <= z.max.x && s.z >= z.min.z && s.z <= z.max.z && s.y >= z.min.y && s.y <= z.max.y)?.name).toBe('Stateroom 3110');
  });

  const places: [string, number, number, number][] = [
    ['engine room', -52, D2, 0], ['cargo hold', 32, D2, -5], ['crew quarters', 2, D2, 5], ['galley', -16, D2, -4],
    ['purser', 12, D3, 5], ['embarkation lobby', 14, D3, -6], ['atrium (deck 3)', 3, D3, 5],
    ['casino', -18, D4, 5], ['restaurant', -44, D4, 3], ['starlight lounge', 30, D4, 5], ['starboard promenade', 0, D4, 10.5],
    ['foredeck', 48, D4, 0], ['aft deck', -63, D4, 3],
    ['pool deck', -40, D5, 0], ['lido bar', 12, D5, 0], ['spa', 22, D5, 0], ['observation deck', 40, D5, 0],
    ['Meridian lounge', -4, D6, 0], ["Vale's suite", 22, D6, 0], ["Castell's suite", 11, D6, -4], ['security office', 11, D6, 4], ['terrace', -20, D6, 0],
    ['sun deck', 0, D7, 0], ['bridge', 24, D7, 0], ['radio room', 15, D7, 0],
  ];
  for (const [name, x, y, z] of places) {
    it(`reaches the ${name} from your stateroom`, () => {
      const n = nav.nearest({ x, y, z }, 2.5);
      expect(n, `${name} isn't walkable`).toBeGreaterThanOrEqual(0);
      // Long multi-deck routes: give the search room.
      expect(nav.findPath(map.playerSpawn, nav.point(n), 200000), name).not.toBeNull();
    });
  }
});

describe('the Aurelia security team', () => {
  const map = createAureliaMap();
  const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
  const nav = new NavGrid(colliders, { bounds: { minX: -85, maxX: 85, minZ: -85, maxZ: 93 }, water: mapWater(map) });
  it('every guard stands and patrols on walkable deck', () => {
    for (const p of map.props) {
      if (p.kind !== 'guard') continue;
      for (const q of [p, ...(p.route ?? [])]) expect(nav.nearest(q, 0.8), `${p.id} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('every uniform can be reached', () => {
    for (const p of map.props) {
      if (p.kind !== 'clue') continue;
      const floor = AURELIA_DECKS.filter(l => l <= p.y + 0.01).at(-1)!;
      const n = nav.nearest({ x: p.x, y: floor, z: p.z }, 1.5);
      expect(n, p.id).toBeGreaterThanOrEqual(0);
      expect(nav.findPath(map.playerSpawn, nav.point(n), 200000), p.id).not.toBeNull();
    }
  });
});

describe('the Aurelia on foot', () => {
  const map = createAureliaMap();
  const colliders = map.blocks.filter(b => isSolid(b.material)).map(blockToAABB);
  const water = mapWater(map);
  const body = (x: number, y: number, z: number): Mover => ({
    pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: PLAYER_RADIUS, height: STANCES.stand.height, onGround: true, canStep: true,
    stance: 'stand', swimming: false, submerged: 0, waterLevel: -Infinity, floor: -Infinity,
  });
  /** Holds a direction for a while; the body must never jump more than a step in one tick. */
  const walk = (b: Mover, yaw: number, seconds: number, buttons = Buttons.Forward, until: (b: Mover) => boolean = () => false, dt = 1 / 60) => {
    for (let t = 0; t < seconds && !until(b); t += dt) {
      const y = b.pos.y;
      stepMovement(b, { buttons, yaw }, dt, colliders, water);
      expect(b.pos.y - y, `popped up at ${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`).toBeLessThan(1.2);
    }
    // Let go and land.
    for (let t = 0; t < 1; t += 1 / 60) stepMovement(b, { buttons: 0, yaw }, 1 / 60, colliders, water);
    return b;
  };
  // Every flight: [name, axis, cross, from, to (along the axis), bottom deck, top deck, which way its outer wall is (across)].
  const flights: [string, 'x' | 'z', [number, number], number, number, number, number, number?][] = [];
  for (const [name, x0] of [['A', -38.6], ['B', 42]] as const) {
    for (let i = 0; i < 3; i++) {
      const lane: [number, number] = i % 2 === 0 ? [1.4, 3.2] : [3.4, 5.2];
      const [s, e] = i % 2 === 0 ? [x0 + 2.1, x0 + 6.3] : [x0 + 6.3, x0 + 2.1];
      flights.push([`stairwell ${name} flight ${i + 1}`, 'x', lane, s, e, AURELIA_DECKS[i], AURELIA_DECKS[i + 1], i % 2 === 0 ? -1 : 1]);
    }
  }
  flights.push(['grand staircase, lower', 'z', [-5.6, -3.6], -5, 5, D3, D4], ['grand staircase, upper', 'z', [3.6, 5.6], 5, -5, D4, D5],
    ['Meridian stair', 'x', [-7.7, -5.9], -10.5, -5, D5, D6], ['bridge stair', 'x', [6.0, 7.6], 7.5, 12.8, D6, D7]);
  const at = (axis: 'x' | 'z', along: number, cross: number, y: number) => axis === 'x' ? body(along, y, cross) : body(cross, y, along);
  const yawAlong = (axis: 'x' | 'z', dir: number) => axis === 'x' ? Math.atan2(-dir, 0) : Math.atan2(0, -dir);
  for (const [name, axis, cross, from, to, y0, y1, wall] of flights) {
    const dir = Math.sign(to - from);
    // Up the middle and hugging either side, walking, running and jumping all the way.
    for (const [how, buttons] of [['walks', Buttons.Forward], ['runs', Buttons.Forward | Buttons.Sprint], ['jumps', Buttons.Forward | Buttons.Sprint | Buttons.Jump]] as const) {
      it(`${how} up and down the ${name}`, () => {
        // At a smooth frame rate and a choppy one, square on and at an angle.
        // Angled into the shaft wall too, where a walled flight has one (off an open stair, an angle just walks you off its side).
        const angles = wall ? [[1 / 60, 0], [0.05, 0], [1 / 60, 0.35], [0.05, 0.35]] : [[1 / 60, 0], [0.05, 0]];
        for (const [dt, lean] of angles)
        for (const c of [(cross[0] + cross[1]) / 2, cross[0] + PLAYER_RADIUS + 0.06, cross[1] - PLAYER_RADIUS - 0.06]) {
          const past = (end: number, d: number) => (b: Mover) => (b.pos[axis] - end) * d > 0.6;
          const skew = (d: number) => -(wall ?? 0) * d * lean;
          const up = walk(at(axis, from - dir * 0.7, c, y0), yawAlong(axis, dir) + skew(dir), 6, buttons, past(to, dir), dt);
          expect(up.pos.y, `${name}: top (dt ${dt.toFixed(3)} lean ${lean} from ${c}, at ${up.pos.x.toFixed(2)},${up.pos.z.toFixed(2)})`).toBeCloseTo(y1, 1);
          const down = walk(at(axis, to + dir * 0.7, c, y1), yawAlong(axis, -dir) + skew(-dir), 6, buttons, past(from, -dir), dt);
          // A running jump can clear the whole opening on the way down: only check you got down without popping.
          if (how !== 'jumps') expect(down.pos.y, `${name}: bottom (dt ${dt.toFixed(3)} lean ${lean} from ${c}, at ${down.pos.x.toFixed(2)},${down.pos.z.toFixed(2)})`).toBeCloseTo(y0, 1);
        }
      });
    }
  }

  it('random running, jumping and crouching never pops you through a deck, through a wall or over the side', () => {
    const nav = new NavGrid(colliders, { bounds: { minX: -85, maxX: 85, minZ: -85, maxZ: 93 }, water });
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // Within the hull, as the barrier outside it sees it (in 1 m slices: the bow's curve is steep).
    const inside = (p: { x: number; z: number }) => Math.abs(p.z) <= Math.max(halfBeam(Math.floor(p.x)), halfBeam(Math.floor(p.x) + 1)) + 0.1 && p.x > -69 && p.x < SHIP.bow;
    let runs = 0;
    while (runs < 160) {
      const deck = AURELIA_DECKS[Math.floor(rand() * AURELIA_DECKS.length)];
      const start = nav.randomNear({ x: -60 + rand() * 110, y: deck, z: (rand() - 0.5) * 20 }, 6, rand);
      // (Not in the forepeak: it's sealed off below the bulkheads, x 52 on deck 2 and x 58 on deck 3.)
      if (!start || !inside(start) || (start.y < D3 - 1 && start.x > 52) || (start.y < D4 - 1 && start.x > 58)) continue;
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
        const where = `run ${runs} (started ${start.x.toFixed(2)},${start.y.toFixed(2)},${start.z.toFixed(2)}, tick ${k}) from ${before.x.toFixed(2)},${before.y.toFixed(2)},${before.z.toFixed(2)} to ${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`;
        expect(b.pos.y - before.y, `popped up: ${where}`).toBeLessThan(1.2);
        expect(Math.hypot(b.pos.x - before.x, b.pos.z - before.z), `shoved: ${where}`).toBeLessThan(0.9);
        expect(inside(b.pos) && b.pos.y > SEA_LEVEL, `over the side: ${where}`).toBe(true);
      }
    }
  });
});
