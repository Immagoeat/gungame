import type { Axis, Vec3 } from '../math/vec';
import type { AABB } from './aabb';
import { STEP_HEIGHT } from '../constants';

/** Anything that moves through the world as an upright box: players, bots, remote players. */
export interface Body {
  pos: Vec3;
  vel: Vec3;
  radius: number;
  height: number;
  onGround: boolean;
  /** Allows walking up ledges no taller than STEP_HEIGHT. */
  canStep?: boolean;
  /** Overrides STEP_HEIGHT (e.g. climbing out of water). */
  stepHeight?: number;
  /** Height of the endless ground plane (default 0; -Infinity on maps with no ground, like the open sea). */
  floor?: number;
}

/** How far feet may already be below a box's top and still land on it (rounding, and settling after a step). */
const LAND_SLOP = 0.05;
const SKIN = 1e-4;
/** Longest horizontal move resolved at once (shorter than a stair tread). */
const MAX_STRIDE = 0.2;

function overlaps(x: number, y: number, z: number, r: number, h: number, b: AABB): boolean {
  return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + h > b.min.y && y < b.max.y;
}

/** Room for the body here (touching is fine; rounding a hair's breadth into a wall it's pressed against too). */
function fits(x: number, y: number, z: number, r: number, h: number, colliders: readonly AABB[]): boolean {
  for (const b of colliders) if (overlaps(x, y, z, r - SKIN, h, b)) return false;
  return true;
}

/**
 * Gets a body out of a box it's stuck in (it can only be in one by arriving at a corner, or being
 * put there): the shortest way out that leaves it free, up no further than a step, never through
 * the box. If no way out is free, the shortest sideways one.
 */
function depenetrate(body: Body, b: AABB, colliders: readonly AABB[], step: number): void {
  const p = body.pos, r = body.radius, h = body.height;
  // Out the side it's barely into, never through to the far side of it (that's how you'd clip through a wall).
  const options = ([
    { axis: 'x', to: b.min.x - r - SKIN, cost: p.x + r - b.min.x },
    { axis: 'x', to: b.max.x + r + SKIN, cost: b.max.x - (p.x - r) },
    { axis: 'z', to: b.min.z - r - SKIN, cost: p.z + r - b.min.z },
    { axis: 'z', to: b.max.z + r + SKIN, cost: b.max.z - (p.z - r) },
  ] as { axis: Axis; to: number; cost: number }[]).filter(o => o.cost <= r + 0.05);
  if (b.max.y - p.y <= step) options.push({ axis: 'y', to: b.max.y, cost: b.max.y - p.y });
  if (p.y + h - b.min.y <= 0.6) options.push({ axis: 'y', to: b.min.y - h - SKIN, cost: p.y + h - b.min.y });
  options.sort((a, c) => a.cost - c.cost);
  for (const o of options) {
    const q = { x: p.x, y: p.y, z: p.z };
    q[o.axis] = o.to;
    if (fits(q.x, q.y, q.z, r, h, colliders)) {
      p[o.axis] = o.to;
      if (o.axis === 'y' && o.to >= b.max.y) { body.onGround = true; body.vel.y = Math.min(0, body.vel.y); }
      return;
    }
  }
  // Wedged with no free way out: a short shove sideways, never a long one.
  const side = options.find(o => o.axis !== 'y');
  if (side) p[side.axis] = side.to;
}

/**
 * Integrates velocity one axis at a time and pushes the body out of any box it enters. Walking into
 * a ledge no taller than a step climbs it, if there's room to stand on top; a body only lands on a
 * box it came down onto, and only bumps its head on one it rose into, so it is never popped through
 * a ceiling or a wall.
 */
export function moveAndCollide(body: Body, all: readonly AABB[], dt: number): void {
  const r = body.radius;
  const h = body.height;
  const p = body.pos;
  const step = body.canStep ? (body.stepHeight ?? STEP_HEIGHT) : 0;
  // Only boxes near this move matter: gather them once, with room for a step up and a push out.
  const mx = Math.abs(body.vel.x * dt) + r + 0.6, mz = Math.abs(body.vel.z * dt) + r + 0.6, my = Math.abs(body.vel.y * dt) + step + 0.7;
  const colliders: AABB[] = [];
  for (const b of all) {
    if (b.max.x > p.x - mx && b.min.x < p.x + mx && b.max.z > p.z - mz && b.min.z < p.z + mz && b.max.y > p.y - my && b.min.y < p.y + h + my) colliders.push(b);
  }
  // Substeps of at most MAX_STRIDE, so a fast body meets one stair tread at a time.
  const substeps = Math.max(1, Math.ceil(Math.max(Math.abs(body.vel.x), Math.abs(body.vel.z)) * dt / MAX_STRIDE));
  for (let i = 0; i < substeps; i++) {
    for (const axis of ['x', 'z'] as const) {
      const delta = body.vel[axis] * dt / substeps;
      if (delta === 0) continue;
      const from = p[axis];
      p[axis] += delta;
      // Everything low enough to step onto: climb onto the highest of it at once, if there's room up there.
      let stepTo = p.y, blocked = false, hit = false;
      for (const b of colliders) {
        if (!overlaps(p.x, p.y, p.z, r, h, b)) continue;
        hit = true;
        if (b.max.y - p.y <= step) stepTo = Math.max(stepTo, b.max.y);
        else blocked = true;
      }
      if (!hit) continue;
      if (!blocked && fits(p.x, stepTo, p.z, r, h, colliders)) { p.y = stepTo; continue; }
      // Otherwise stop at whatever it walked into. A box it was already in isn't one it walked into (that's for depenetrate).
      for (const b of colliders) {
        if (!overlaps(p.x, p.y, p.z, r, h, b)) continue;
        if (delta > 0 && from + r <= b.min[axis] + SKIN) p[axis] = Math.min(p[axis], b.min[axis] - r - SKIN);
        else if (delta < 0 && from - r >= b.max[axis] - SKIN) p[axis] = Math.max(p[axis], b.max[axis] + r + SKIN);
        else if (b.max.y - p.y > step) {
          // Already a little way into it (a corner, a stance change): it can back out, but not go any deeper.
          const centre = (b.min[axis] + b.max[axis]) / 2;
          if ((delta > 0) === (centre > from)) p[axis] = delta > 0 ? Math.min(p[axis], from) : Math.max(p[axis], from);
        }
      }
    }
  }
  const dy = body.vel.y * dt;
  const prevY = p.y;
  body.onGround = false;
  p.y += dy;
  for (const b of colliders) {
    if (!overlaps(p.x, p.y, p.z, r, h, b)) continue;
    if (dy <= 0 && prevY >= b.max.y - LAND_SLOP) {
      p.y = b.max.y;
      body.onGround = true;
      body.vel.y = 0;
    } else if (dy > 0 && prevY + h <= b.min.y + LAND_SLOP) {
      p.y = b.min.y - h;
      body.vel.y = 0;
    } else {
      depenetrate(body, b, colliders, step + LAND_SLOP);
    }
  }
  const ground = body.floor ?? 0;
  if (p.y <= ground) {
    p.y = ground;
    body.vel.y = Math.max(0, body.vel.y);
    body.onGround = true;
  }
}
