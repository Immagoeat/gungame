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
}

const AXES: readonly Axis[] = ['x', 'z', 'y'];

/** Integrates velocity one axis at a time and pushes the body out of any box it enters. */
export function moveAndCollide(body: Body, colliders: readonly AABB[], dt: number): void {
  const r = body.radius;
  const h = body.height;
  const p = body.pos;
  for (const axis of AXES) {
    const delta = body.vel[axis] * dt;
    if (axis === 'y') body.onGround = false;
    p[axis] += delta;
    for (const b of colliders) {
      const overlaps = p.x + r > b.min.x && p.x - r < b.max.x &&
        p.z + r > b.min.z && p.z - r < b.max.z &&
        p.y + h > b.min.y && p.y < b.max.y;
      if (!overlaps) continue;
      if (axis === 'y') {
        if (delta <= 0) { p.y = b.max.y; body.onGround = true; } else p.y = b.min.y - h;
        body.vel.y = 0;
      } else if (body.canStep && b.max.y - p.y <= (body.stepHeight ?? STEP_HEIGHT)) {
        p.y = b.max.y;
      } else if (delta > 0) p[axis] = b.min[axis] - r;
      else if (delta < 0) p[axis] = b.max[axis] + r;
    }
  }
  if (p.y <= 0) {
    p.y = 0;
    body.vel.y = Math.max(0, body.vel.y);
    body.onGround = true;
  }
}
