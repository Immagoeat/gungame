import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../constants';
import { footprintBlocked } from '../physics/aabb';
import { Buttons, stepMovement, type Mover } from '../physics/movement';
import { mapColliders, mapWater, zoneAt } from './blocks';
import { createMansionMap, MANSION_LEVELS } from './mansion';

const map = createMansionMap();
const colliders = mapColliders(map);
const water = mapWater(map);
const [B, G, F2, F3, R] = MANSION_LEVELS;
const NORTH = 0;
const SOUTH = Math.PI;

const player = (x: number, y: number, z: number): Mover => ({
  pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, onGround: true, canStep: true,
  stance: 'stand', swimming: false, submerged: 0, waterLevel: -Infinity,
});

/** Walks in a straight line for `seconds`, like holding W. */
function walk(p: Mover, yaw: number, seconds: number, buttons: number = Buttons.Forward): Mover {
  for (let t = 0; t < seconds; t += 1 / 60) stepMovement(p, { buttons, yaw }, 1 / 60, colliders, water);
  return p;
}

describe('the mansion', () => {
  it('spawns the player on open ground at the front gate', () => {
    const s = map.playerSpawn;
    expect(footprintBlocked(s.x, s.z, PLAYER_RADIUS, colliders.filter(c => c.max.y > s.y + 0.1 && c.min.y < s.y + 1.7))).toBe(false);
    expect(zoneAt(map, { ...s, y: s.y + 1 })?.name).toBe('Front Gate');
  });

  it('lets you walk from the gate, around the fountain, through the front door', () => {
    const p = walk(player(-5.5, G, 41), NORTH, 7);
    expect(p.pos.z).toBeLessThan(7); // reached the facade beside the door
    p.pos.x = 0;
    walk(p, NORTH, 1);
    expect(zoneAt(map, { ...p.pos, y: p.pos.y + 1 })?.name).toBe('Grand Foyer');
  });

  it('grand staircase climbs from the foyer to the gallery', () => {
    const p = walk(player(0, G, 2), NORTH, 1.4);
    expect(p.pos.y).toBeCloseTo(F2, 1);
    expect(zoneAt(map, { ...p.pos, y: p.pos.y + 1 })?.floor).toBe('Second Floor');
  });

  it('service stairs climb from the basement to the roof', () => {
    // Basement corridor door -> up lane B to the north landing.
    const p = walk(player(8.9, B, 4), NORTH, 1.6);
    expect(p.pos.z).toBeLessThan(-3.6);
    // Each flight starts from its landing.
    const flight = (x: number, y: number, z: number, yaw: number, expectY: number) => {
      const q = walk(player(x, y, z), yaw, 1.3);
      expect(q.pos.y).toBeCloseTo(expectY, 1);
      return q;
    };
    flight(6.9, B, -4.5, SOUTH, G);
    flight(8.9, G, 2.5, NORTH, F2);
    flight(6.9, F2, -4.5, SOUTH, F3);
    const top = flight(8.9, F3, 2.5, NORTH, R);
    expect(zoneAt(map, { ...top.pos, y: top.pos.y + 1 })?.name).toBe('Helipad');
  });

  it('lets you swim in the pool and climb out over the edge', () => {
    // Deep end: you float rather than stand.
    const p = walk(player(6, G - 3.2, -32), NORTH, 3, 0);
    expect(p.swimming).toBe(true);
    expect(p.pos.y + 1.6).toBeGreaterThan(G - 0.25);
    walk(p, NORTH, 4);
    expect(p.pos.y).toBeGreaterThanOrEqual(G); // on the deck (or its coping)
    expect(p.swimming).toBe(false);
  });

  it('has uniquely named security cameras and a monitor bank', () => {
    const cams = map.props.filter(p => p.kind === 'securityCamera');
    expect(cams.length).toBeGreaterThan(20);
    expect(new Set(cams.map(c => c.kind === 'securityCamera' && c.id)).size).toBe(cams.length);
    expect(map.props.some(p => p.kind === 'monitorBank')).toBe(true);
  });
});
