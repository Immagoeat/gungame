import { FACE, FURNITURE, type Facing, type FurnitureSpec, type FurnitureType } from './furniture';
import type { Block, BlockMaterial, PropDef, ZoneDef } from './types';

/** Axis-aligned rectangle on the ground plane (or, for walls, in along-wall/height space). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect =>
  ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });

const uniqueSorted = (vals: number[]) =>
  [...new Set(vals.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

/** Splits `outer` minus `holes` into a small set of non-overlapping rectangles. */
export function subtractRects(outer: Rect, holes: readonly Rect[]): Rect[] {
  const clipped = holes
    .map(h => ({ x0: Math.max(h.x0, outer.x0), z0: Math.max(h.z0, outer.z0), x1: Math.min(h.x1, outer.x1), z1: Math.min(h.z1, outer.z1) }))
    .filter(h => h.x0 < h.x1 && h.z0 < h.z1);
  if (!clipped.length) return [outer];
  const xs = uniqueSorted([outer.x0, outer.x1, ...clipped.flatMap(h => [h.x0, h.x1])]);
  const zs = uniqueSorted([outer.z0, outer.z1, ...clipped.flatMap(h => [h.z0, h.z1])]);
  const filled = (i: number, j: number) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cz = (zs[j] + zs[j + 1]) / 2;
    return !clipped.some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
  };
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let j = 0; j < zs.length - 1; j++) {
    const next = new Map<string, Rect>();
    let i = 0;
    while (i < xs.length - 1) {
      if (!filled(i, j)) { i++; continue; }
      const start = i;
      while (i < xs.length - 1 && filled(i, j)) i++;
      const key = `${xs[start]},${xs[i]}`;
      const prev = open.get(key);
      if (prev) {
        prev.z1 = zs[j + 1];
        next.set(key, prev);
      } else {
        const r = { x0: xs[start], z0: zs[j], x1: xs[i], z1: zs[j + 1] };
        out.push(r);
        next.set(key, r);
      }
    }
    open = next;
  }
  return out;
}

/** A gap in a wall. from/to are absolute coordinates along the wall; bottom/top are relative to the wall base. */
export interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
  glass?: boolean;
}

export const doorway = (center: number, width = 1.2, height = 2.4): Opening =>
  ({ from: center - width / 2, to: center + width / 2, bottom: 0, top: height });

export const glazing = (from: number, to: number, bottom = 1, top = 3.2): Opening =>
  ({ from, to, bottom, top, glass: true });

/** Wall material; a pair gives different faces on the -axis and +axis sides (e.g. plaster inside, stucco outside). */
export type WallMaterial = BlockMaterial | readonly [BlockMaterial, BlockMaterial];

const STEP_RISE = 0.3;
const FRAME = 0.06;
const MAX_PANE_WIDTH = 1.5;

/** [a0, a1] minus the given intervals. */
function subtractIntervals(a0: number, a1: number, cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a0, a1]];
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([s0, s1]): [number, number][] => {
      if (c1 <= s0 || c0 >= s1) return [[s0, s1]];
      return [[s0, Math.max(s0, c0)], [Math.min(s1, c1), s1]].filter(([x, y]) => y - x > 0.02) as [number, number][];
    });
  }
  return out;
}

export interface FurnitureOptions {
  w?: number;
  h?: number;
  d?: number;
  color?: number;
  variant?: number;
}

/** Helpers for authoring maps out of boxes. */
export class MapBuilder {
  readonly blocks: Block[] = [];
  readonly props: PropDef[] = [];
  readonly zones: ZoneDef[] = [];

  /** Box from two opposite corners. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: BlockMaterial, tint?: number, invisible = false, resistance?: number): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    if (bx - ax < 1e-4 || by - ay < 1e-4 || bz - az < 1e-4) return;
    const b: Block = { x: (ax + bx) / 2, y: ay, z: (az + bz) / 2, sx: bx - ax, sy: by - ay, sz: bz - az, material };
    if (tint !== undefined) b.tint = tint;
    if (invisible) b.invisible = true;
    if (resistance !== undefined) b.resistance = resistance;
    this.blocks.push(b);
  }

  /** Floor slab whose top is at `top`. With a ceiling material, the underside gets its own thin layer. */
  slab(r: Rect, top: number, floor: BlockMaterial, opts: { ceiling?: BlockMaterial; thickness?: number; holes?: Rect[] } = {}): void {
    const t = opts.thickness ?? 0.3;
    const ft = opts.ceiling ? 0.06 : t;
    for (const p of subtractRects(r, opts.holes ?? [])) {
      this.box(p.x0, top - ft, p.z0, p.x1, top, p.z1, floor);
      if (opts.ceiling) this.box(p.x0, top - t, p.z0, p.x1, top - ft, p.z1, opts.ceiling);
    }
  }

  /** Thin decorative surface (rug, path, court) lying on a floor. */
  overlay(x0: number, z0: number, x1: number, z1: number, y: number, material: BlockMaterial, tint?: number): void {
    this.box(x0, y, z0, x1, y + 0.03, z1, material, tint);
  }

  /**
   * Axis-aligned wall along x (z0 === z1) or along z (x0 === x1), from y0 to y1, with openings cut out.
   * Glass openings get framed, mullioned windows; plaster faces get baseboards, crown molding,
   * door casings and window sills unless `trim` is false.
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, material: WallMaterial,
    opts: { thickness?: number; openings?: Opening[]; trim?: boolean } = {}): void {
    const alongX = Math.abs(z0 - z1) < 1e-6;
    if (!alongX && Math.abs(x0 - x1) > 1e-6) throw new Error('wall must be axis-aligned');
    const t = opts.thickness ?? 0.2;
    const c = alongX ? z0 : x0;
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const openings = opts.openings ?? [];
    const holes = openings.map(o => rect(o.from, y0 + o.bottom, o.to, y0 + o.top));
    const layers: [number, number, BlockMaterial][] = typeof material === 'string' || material[0] === material[1]
      ? [[c - t / 2, c + t / 2, typeof material === 'string' ? material : material[0]]]
      : [[c - t / 2, c, material[0]], [c, c + t / 2, material[1]]];
    const place = (a: number, b: number, ya: number, yb: number, c0: number, c1: number, m: BlockMaterial) =>
      alongX ? this.box(a, ya, c0, b, yb, c1, m) : this.box(c0, ya, a, c1, yb, b, m);
    for (const p of subtractRects(rect(a0, y0, a1, y1), holes)) {
      for (const [c0, c1, m] of layers) place(p.x0, p.x1, p.z0, p.z1, c0, c1, m);
    }
    for (const o of openings) if (o.glass) this.window(o, y0, c, t, place);

    if (opts.trim === false) return;
    const faces: [number, 1 | -1, BlockMaterial][] = [
      [c - t / 2, -1, layers[0][2]],
      [c + t / 2, 1, layers[layers.length - 1][2]],
    ];
    const height = y1 - y0;
    for (const [f, dir, m] of faces) {
      if (m !== 'plaster') continue;
      const out = (depth: number): [number, number] => [f, f + dir * depth];
      for (const [a, b] of subtractIntervals(a0, a1, openings.filter(o => o.bottom < 0.15).map(o => [o.from, o.to]))) {
        place(a, b, y0, y0 + 0.14, ...out(0.025), 'trim');
      }
      for (const [a, b] of subtractIntervals(a0, a1, openings.filter(o => o.top > height - 0.15).map(o => [o.from, o.to]))) {
        place(a, b, y1 - 0.12, y1, ...out(0.05), 'trim');
      }
      for (const o of openings) {
        if (o.glass) {
          if (o.bottom > 0.3) place(o.from - 0.1, o.to + 0.1, y0 + o.bottom - 0.04, y0 + o.bottom, ...out(0.14), 'trim');
          continue;
        }
        const head = y0 + o.top;
        const top = Math.min(y1 - 0.12, head + 0.09);
        if (o.from - 0.09 > a0) place(o.from - 0.09, o.from, y0 + o.bottom, top, ...out(0.03), 'trim');
        if (o.to + 0.09 < a1) place(o.to, o.to + 0.09, y0 + o.bottom, top, ...out(0.03), 'trim');
        if (top > head + 0.01) place(o.from - 0.09, o.to + 0.09, head, top, ...out(0.03), 'trim');
      }
    }
  }

  /** Framed window filling an opening: outer frame, mullions every ~1.5 m, a transom on tall windows, one glass pane per cell. */
  private window(o: Opening, y0: number, c: number, t: number,
    place: (a: number, b: number, ya: number, yb: number, c0: number, c1: number, m: BlockMaterial) => void): void {
    const yb = y0 + o.bottom;
    const yt = y0 + o.top;
    const width = o.to - o.from;
    const cols = Math.max(1, Math.ceil(width / MAX_PANE_WIDTH));
    const transom = yt - yb > 3 ? yb + (yt - yb) * 0.78 : null;
    const [f0, f1] = [c - t / 2, c + t / 2];
    place(o.from, o.to, yb, yb + FRAME, f0, f1, 'windowFrame');
    place(o.from, o.to, yt - FRAME, yt, f0, f1, 'windowFrame');
    place(o.from, o.from + FRAME, yb, yt, f0, f1, 'windowFrame');
    place(o.to - FRAME, o.to, yb, yt, f0, f1, 'windowFrame');
    for (let i = 1; i < cols; i++) {
      const m = o.from + (i * width) / cols;
      place(m - FRAME / 2, m + FRAME / 2, yb, yt, c - 0.05, c + 0.05, 'windowFrame');
    }
    if (transom !== null) place(o.from, o.to, transom - FRAME / 2, transom + FRAME / 2, c - 0.05, c + 0.05, 'windowFrame');
    const rows: [number, number][] = transom === null
      ? [[yb + FRAME, yt - FRAME]]
      : [[yb + FRAME, transom - FRAME / 2], [transom + FRAME / 2, yt - FRAME]];
    for (let i = 0; i < cols; i++) {
      const pa = o.from + (i * width) / cols + (i === 0 ? FRAME : FRAME / 2);
      const pb = o.from + ((i + 1) * width) / cols - (i === cols - 1 ? FRAME : FRAME / 2);
      for (const [ra, rb] of rows) place(pa, pb, ra, rb, c - 0.03, c + 0.03, 'glass');
    }
  }

  /**
   * Places a detailed furniture prop and, if it's solid, invisible collision boxes for it.
   * `face` is the direction the piece's front faces.
   */
  furniture(type: FurnitureType, x: number, y: number, z: number, face: Facing | number = 'south', opts: FurnitureOptions = {}): void {
    const spec: FurnitureSpec = FURNITURE[type];
    const w = opts.w ?? spec.size[0];
    const h = opts.h ?? spec.size[1];
    const d = opts.d ?? spec.size[2];
    const yaw = typeof face === 'number' ? face : FACE[face];
    const prop: PropDef = { kind: 'furniture', type, x, y, z, yaw };
    for (const k of ['w', 'h', 'd', 'color', 'variant'] as const) if (opts[k] !== undefined) prop[k] = opts[k];
    this.props.push(prop);
    if (spec.solid === false) return;
    // Collision boxes are axis-aligned, so rotation snaps to the nearest quarter turn.
    const cos = Math.round(Math.cos(yaw));
    const sin = Math.round(Math.sin(yaw));
    const boxes = spec.colliders ? spec.colliders(w, h, d) : [[-w / 2, 0, -d / 2, w / 2, h, d / 2]];
    for (const [lx0, ly0, lz0, lx1, ly1, lz1] of boxes) {
      const ax = lx0 * cos + lz0 * sin, az = -lx0 * sin + lz0 * cos;
      const bx = lx1 * cos + lz1 * sin, bz = -lx1 * sin + lz1 * cos;
      this.box(x + ax, y + ly0, z + az, x + bx, y + ly1, z + bz, 'plaster', undefined, true, spec.resistance ?? 3);
    }
  }

  /**
   * Straight flight of stairs. `cross` is the extent across the stairs, `start`/`end` the along-axis
   * coordinates of the bottom and top edges. Steps are solid down to yFrom.
   */
  stairs(axis: 'x' | 'z', cross: [number, number], start: number, end: number, yFrom: number, yTo: number,
    material: BlockMaterial, opts: { rails?: boolean; runner?: number } = {}): void {
    const n = Math.max(1, Math.round((yTo - yFrom) / STEP_RISE));
    const rise = (yTo - yFrom) / n;
    const run = (end - start) / n;
    const [c0, c1] = [Math.min(...cross), Math.max(...cross)];
    for (let i = 0; i < n; i++) {
      const s0 = start + i * run;
      const s1 = s0 + run;
      const top = yFrom + (i + 1) * rise;
      if (axis === 'z') this.box(c0, yFrom, s0, c1, top, s1, material);
      else this.box(s0, yFrom, c0, s1, top, c1, material);
      if (opts.runner !== undefined) {
        const inset = (c1 - c0) * 0.18;
        if (axis === 'z') this.box(c0 + inset, top, s0, c1 - inset, top + 0.015, s1, 'carpet', opts.runner);
        else this.box(s0, top, c0 + inset, s1, top + 0.015, c1 - inset, 'carpet', opts.runner);
      }
      if (opts.rails) {
        for (const edge of [c0, c1]) {
          if (axis === 'z') this.box(edge - 0.03, top, s0, edge + 0.03, top + 1, s1, 'glass');
          else this.box(s0, top, edge - 0.03, s1, top + 1, edge + 0.03, 'glass');
        }
      }
    }
  }

  /** Glass balustrade with a metal handrail along an axis-aligned line. */
  railing(x0: number, z0: number, x1: number, z1: number, y: number, height = 1.05): void {
    const alongX = Math.abs(z0 - z1) < 1e-6;
    if (alongX) {
      this.box(x0, y, z0 - 0.03, x1, y + height - 0.06, z0 + 0.03, 'glass');
      this.box(x0, y + height - 0.06, z0 - 0.05, x1, y + height, z0 + 0.05, 'metal');
    } else {
      this.box(x0 - 0.03, y, z0, x0 + 0.03, y + height - 0.06, z1, 'glass');
      this.box(x0 - 0.05, y + height - 0.06, z0, x0 + 0.05, y + height, z1, 'metal');
    }
  }

  zone(name: string, floor: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
    this.zones.push({
      name, floor,
      min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) },
      max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) },
    });
  }

  /** Wall-mounted security camera at (x,y,z) aimed at a target point; sweeps ±sweep radians around it. */
  securityCamera(id: string, label: string, x: number, y: number, z: number, tx: number, ty: number, tz: number, sweep = 0.5): void {
    const dx = tx - x;
    const dz = tz - z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(ty - y, Math.hypot(dx, dz));
    this.props.push({ kind: 'securityCamera', id, label, x, y, z, yaw, pitch, sweep });
  }

  /** A ceiling light: a point light plus (by default) a visible, shootable fixture just above it. */
  light(x: number, y: number, z: number, color = 0xfff0d8, intensity = 14, distance = 16, fixture = true): void {
    this.props.push({ kind: 'light', x, y, z, color, intensity, distance, fixture });
  }

  palm(x: number, z: number, ground: number, height = 8): void {
    this.box(x - 0.2, ground, z - 0.2, x + 0.2, ground + height, z + 0.2, 'palmTrunk');
    this.props.push({ kind: 'palmCrown', x, y: ground + height, z });
  }
}
