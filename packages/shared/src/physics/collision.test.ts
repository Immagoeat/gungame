import { describe, expect, it } from 'vitest';
import type { AABB } from './aabb';
import { moveAndCollide } from './collision';
import { Buttons, STANCES, stepMovement, type Mover } from './movement';

const body = (x = 0, y = 0, z = 0): Mover => ({
  pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: 0.4, height: 1.75, onGround: false, canStep: true,
  stance: 'stand', swimming: false, submerged: 0, waterLevel: -Infinity,
});
const run = (b: Mover, buttons: number, seconds: number, colliders: AABB[] = [], water: AABB[] = []) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepMovement(b, { buttons, yaw: 0 }, 1 / 60, colliders, water);
  return b;
};
const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB =>
  ({ min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } });

describe('moveAndCollide', () => {
  it('lands on the floor', () => {
    const b = body(0, 2, 0);
    b.vel.y = -10;
    for (let i = 0; i < 30; i++) moveAndCollide(b, [], 1 / 60);
    expect(b.pos.y).toBe(0);
    expect(b.onGround).toBe(true);
  });

  it('is stopped by a tall wall', () => {
    const b = body();
    b.vel.x = 6;
    const wall = box(2, 0, -5, 3, 4, 5);
    for (let i = 0; i < 120; i++) moveAndCollide(b, [wall], 1 / 60);
    expect(b.pos.x).toBeCloseTo(2 - b.radius);
  });

  it('steps up a low ledge', () => {
    const b = body();
    b.vel.x = 6;
    const ledge = box(1, 0, -5, 5, 0.4, 5);
    for (let i = 0; i < 30; i++) moveAndCollide(b, [ledge], 1 / 60);
    expect(b.pos.x).toBeGreaterThan(1.5);
    expect(b.pos.y).toBeCloseTo(0.4);
  });
});

describe('stances', () => {
  it('crouching and crawling lower the body and slow you down', () => {
    const stand = run(body(), Buttons.Forward, 1);
    const crouch = run(body(), Buttons.Forward | Buttons.Crouch, 1);
    const prone = run(body(), Buttons.Forward | Buttons.Prone, 1);
    expect(crouch.height).toBe(STANCES.crouch.height);
    expect(prone.height).toBe(STANCES.prone.height);
    expect(-crouch.pos.z).toBeLessThan(-stand.pos.z * 0.6);
    expect(-prone.pos.z).toBeLessThan(-crouch.pos.z * 0.6);
  });

  it('cannot stand up under a low ceiling', () => {
    const shelf = box(-2, 1.2, -2, 2, 1.5, 2);
    // Crouch-walk in under the shelf from outside, then let go of crouch.
    const b = run(body(0, 0, 4), Buttons.Crouch | Buttons.Forward, 2, [shelf]);
    expect(b.pos.z).toBeLessThan(1);
    run(b, 0, 0.5, [shelf]);
    expect(b.stance).toBe('crouch');
    b.pos.z = 5;
    run(b, 0, 0.1, [shelf]);
    expect(b.stance).toBe('stand');
  });
});

describe('water', () => {
  const pool = box(-10, 0, -10, 10, 2.5, 10);
  it('floats a swimmer with eyes just above the surface', () => {
    const b = body(0, 0.2, 0);
    run(b, 0, 4, [], [pool]);
    expect(b.swimming).toBe(true);
    const eye = b.pos.y + STANCES.stand.eye;
    expect(eye).toBeGreaterThan(2.5);
    expect(eye).toBeLessThan(2.9);
  });

  it('dives when holding descend, and swims slower than walking', () => {
    const b = body(0, 1, 0);
    run(b, 0, 2, [], [pool]);
    const floating = b.pos.y;
    run(b, Buttons.Descend, 1.5, [], [pool]);
    expect(b.pos.y).toBeLessThan(floating - 0.5);
    const start = b.pos.z;
    run(b, Buttons.Forward, 1, [], [pool]);
    expect(start - b.pos.z).toBeLessThan(3);
  });
});

describe('stepMovement', () => {
  it('moves forward along -z at yaw 0', () => {
    const b = body();
    b.onGround = true;
    for (let i = 0; i < 60; i++) stepMovement(b, { buttons: Buttons.Forward, yaw: 0 }, 1 / 60, []);
    expect(b.pos.z).toBeLessThan(-3);
    expect(Math.abs(b.pos.x)).toBeLessThan(1e-9);
  });
});
