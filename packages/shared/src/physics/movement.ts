import { AIR_ACCEL, GRAVITY, GROUND_ACCEL, JUMP_VELOCITY, MOVE_SPEED, STEP_HEIGHT } from '../constants';
import { aabbIntersects, type AABB } from './aabb';
import { moveAndCollide, type Body } from './collision';

/** Player input as a bitmask, so it is cheap to send over the network. */
export const Buttons = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Aim: 1 << 6,
  Fire: 1 << 7,
  /** Desired stance (toggled by the client). Prone wins over crouch. */
  Crouch: 1 << 8,
  Prone: 1 << 9,
  /** Held to dive while swimming. */
  Descend: 1 << 10,
} as const;

export type Stance = 'stand' | 'crouch' | 'prone';

/** Body height, eye height and speed multiplier for each stance. */
export const STANCES: Record<Stance, { height: number; eye: number; speed: number }> = {
  stand: { height: 1.75, eye: 1.6, speed: 1 },
  crouch: { height: 1.15, eye: 1.0, speed: 0.45 },
  prone: { height: 0.55, eye: 0.35, speed: 0.2 },
};

export const SWIM_SPEED = 2.2;
/** Water deeper than this (as a fraction of standing height) lifts you off your feet. */
const SWIM_DEPTH = 0.62;
/** Buoyancy: at equilibrium this fraction of the body is under water (eyes just above the surface). */
const FLOAT_FRACTION = 0.86;

export interface MoveInput {
  buttons: number;
  yaw: number;
}

/** A player-like body: stance and water state on top of a plain collision body. */
export interface Mover extends Body {
  stance: Stance;
  /** Feet are off the bottom and the body is held up by water. */
  swimming: boolean;
  /** Fraction of the body below the water surface (0 = dry). */
  submerged: number;
  /** Height of the water surface the body is in, or -Infinity. */
  waterLevel: number;
}

export const hasButton = (buttons: number, b: number) => (buttons & b) !== 0;

export function isSprinting(buttons: number): boolean {
  return hasButton(buttons, Buttons.Sprint) && hasButton(buttons, Buttons.Forward) && !hasButton(buttons, Buttons.Aim);
}

export function desiredStance(buttons: number): Stance {
  if (hasButton(buttons, Buttons.Prone)) return 'prone';
  if (hasButton(buttons, Buttons.Crouch)) return 'crouch';
  return 'stand';
}

/** True if a body of the given height fits at its current position. */
export function hasHeadroom(body: Body, height: number, colliders: readonly AABB[]): boolean {
  const r = body.radius - 0.02;
  const box: AABB = {
    min: { x: body.pos.x - r, y: body.pos.y + 0.05, z: body.pos.z - r },
    max: { x: body.pos.x + r, y: body.pos.y + height, z: body.pos.z + r },
  };
  return !colliders.some(c => aabbIntersects(c, box));
}

/** Water surface above the body's footprint, if it is standing in or under water. */
function waterAt(body: Body, water: readonly AABB[]): number {
  let level = -Infinity;
  for (const w of water) {
    if (body.pos.x < w.min.x || body.pos.x > w.max.x || body.pos.z < w.min.z || body.pos.z > w.max.z) continue;
    if (body.pos.y > w.max.y || body.pos.y + body.height < w.min.y) continue;
    level = Math.max(level, w.max.y);
  }
  return level;
}

/**
 * One step of player movement. Client prediction and the server both run this, so a player moves
 * identically on both sides. Handles stance changes (only if there is headroom), walking,
 * wading and swimming.
 */
export function stepMovement(body: Mover, input: MoveInput, dt: number, colliders: readonly AABB[], water: readonly AABB[] = []): void {
  const b = input.buttons;

  // Stance: dropping down is always allowed, getting up needs room overhead. Swimming forces upright.
  const want = body.swimming ? 'stand' : desiredStance(b);
  if (want !== body.stance && (STANCES[want].height < body.height || hasHeadroom(body, STANCES[want].height, colliders))) {
    body.stance = want;
  }
  body.height = STANCES[body.stance].height;

  // Water.
  body.waterLevel = waterAt(body, water);
  const depth = body.waterLevel - body.pos.y;
  body.submerged = depth > 0 ? Math.min(1, depth / STANCES.stand.height) : 0;
  body.swimming = body.submerged > SWIM_DEPTH || (body.swimming && body.submerged > 0.35 && !body.onGround);
  const wading = !body.swimming && body.submerged > 0.25;

  const speed = body.swimming
    ? SWIM_SPEED * (hasButton(b, Buttons.Sprint) ? 1.5 : 1)
    : (hasButton(b, Buttons.Aim) ? MOVE_SPEED.aim : isSprinting(b) && body.stance === 'stand' ? MOVE_SPEED.sprint : MOVE_SPEED.walk)
      * STANCES[body.stance].speed * (wading ? 0.6 : 1);
  const f = (hasButton(b, Buttons.Forward) ? 1 : 0) - (hasButton(b, Buttons.Back) ? 1 : 0);
  const s = (hasButton(b, Buttons.Right) ? 1 : 0) - (hasButton(b, Buttons.Left) ? 1 : 0);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wx = -sin * f + cos * s;
  let wz = -cos * f - sin * s;
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx = wx / len * speed; wz = wz / len * speed; }

  const grip = body.swimming ? 3 : body.onGround ? GROUND_ACCEL : AIR_ACCEL;
  const accel = 1 - Math.exp(-grip * dt);
  body.vel.x += (wx - body.vel.x) * accel;
  body.vel.z += (wz - body.vel.z) * accel;

  if (body.swimming) {
    // Buoyancy pushes towards floating with eyes just above water; water drag damps everything.
    const buoyancy = GRAVITY * (body.submerged / FLOAT_FRACTION);
    body.vel.y += (buoyancy - GRAVITY) * dt;
    if (hasButton(b, Buttons.Jump)) body.vel.y += 9 * dt;
    if (hasButton(b, Buttons.Descend)) body.vel.y -= 11 * dt;
    body.vel.y *= Math.exp(-2.8 * dt);
    // Can haul yourself out over a ledge a little above the surface.
    body.stepHeight = Math.max(STEP_HEIGHT, body.waterLevel + 0.55 - body.pos.y);
  } else {
    body.vel.y -= GRAVITY * dt * (body.submerged > 0 ? 0.7 : 1);
    if (hasButton(b, Buttons.Jump) && body.onGround && body.stance === 'stand' && !wading) {
      body.vel.y = JUMP_VELOCITY;
      body.onGround = false;
    }
    body.stepHeight = undefined;
  }
  moveAndCollide(body, colliders, dt);
}
