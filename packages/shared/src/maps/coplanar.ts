import type { Block, MapDef } from './types';

/** How far a hidden face is pulled back into the box covering it. */
const NUDGE = 0.01;
/** Faces this close count as the same plane. */
const SAME = 0.002;
const CELL = 4;

type Box = { lo: [number, number, number]; hi: [number, number, number] };
const toBox = (b: Block): Box => ({ lo: [b.x - b.sx / 2, b.y, b.z - b.sz / 2], hi: [b.x + b.sx / 2, b.y + b.sy, b.z + b.sz / 2] });
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * Removes z-fighting: wherever two blocks that look different have faces in the same plane, facing
 * the same way and overlapping (a rug's top flush with a runner's, a wall's top flush with the
 * floor over it, a slab's edge flush with the wall it runs into), one face is pulled back a
 * centimetre into the other block. The one that gives way is the bigger along that axis (its face
 * is the one buried in the other), or for two alike (two rugs), the one laid first, so the later
 * one shows. Downward faces are left alone: they sit on floors, out of sight.
 */
export function separateCoplanarFaces(map: MapDef): MapDef {
  // Pulling faces back can line some up anew (two walls under one floor): a few passes settle it.
  for (let pass = 0; pass < 4 && separatePass(map) > 0; pass++);
  settleFloorCoverings(map);
  return map;
}

/** Thin things laid on the floor: drawn from the prop's y up, so they need to sit on the floor's real top. */
const FLOOR_COVERINGS = new Set(['rug', 'roundRug', 'medallion', 'redCarpet']);

/**
 * Lays rugs on whatever floor is actually under them: a rug placed at a deck's height on a floor
 * that has a carpet or tile layer over it would otherwise be buried in it, or poke through in patches.
 */
function settleFloorCoverings(map: MapDef): void {
  for (const p of map.props) {
    if (p.kind !== 'furniture' || !FLOOR_COVERINGS.has(p.type)) continue;
    let top = -Infinity;
    for (const b of map.blocks) {
      if (b.invisible || b.material === 'water') continue;
      const t = b.y + b.sy;
      if (t < p.y - 0.02 || t > p.y + 0.12) continue;
      if (Math.abs(p.x - b.x) > b.sx / 2 || Math.abs(p.z - b.z) > b.sz / 2) continue;
      top = Math.max(top, t);
    }
    if (top > p.y) p.y = top + 0.002;
  }
}

function separatePass(map: MapDef): number {
  const blocks = map.blocks.filter(b => !b.invisible && b.material !== 'water');
  const boxes = blocks.map(toBox);
  const grid = new Map<string, number[]>();
  boxes.forEach((b, i) => {
    for (let x = Math.floor(b.lo[0] / CELL); x <= Math.floor(b.hi[0] / CELL); x++)
      for (let z = Math.floor(b.lo[2] / CELL); z <= Math.floor(b.hi[2] / CELL); z++) {
        const k = x * 100003 + z;
        (grid.get(String(k)) ?? grid.set(String(k), []).get(String(k))!).push(i);
      }
  });
  // Moves to make: [box index, axis, which end (0 low, 1 high)]. Collected first so one pass sees the original layout.
  const moves = new Set<string>();
  const seen = new Set<number>();
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let c = a + 1; c < list.length; c++) {
      const i = Math.min(list[a], list[c]), j = Math.max(list[a], list[c]);
      const pair = i * 1_000_003 + j;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const bi = blocks[i], bj = blocks[j];
      if (bi.material === bj.material && (bi.tint ?? -1) === (bj.tint ?? -1)) continue; // alike: nothing to see
      const p = boxes[i], q = boxes[j];
      for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3, v = (axis + 2) % 3;
        if (overlap(p.lo[u], p.hi[u], q.lo[u], q.hi[u]) <= 0.005 || overlap(p.lo[v], p.hi[v], q.lo[v], q.hi[v]) <= 0.005) continue;
        for (const end of [0, 1] as const) {
          if (axis === 1 && end === 0) continue; // undersides
          const fp = end ? p.hi[axis] : p.lo[axis], fq = end ? q.hi[axis] : q.lo[axis];
          if (Math.abs(fp - fq) > SAME) continue;
          const sp = p.hi[axis] - p.lo[axis], sq = q.hi[axis] - q.lo[axis];
          const give = Math.abs(sp - sq) > SAME ? (sp > sq ? i : j) : i;
          if (boxes[give].hi[axis] - boxes[give].lo[axis] > NUDGE * 2) moves.add(`${give}:${axis}:${end}`);
        }
      }
    }
  }
  for (const m of moves) {
    const [k, axis, end] = m.split(':').map(Number);
    const b = blocks[k];
    const d = end ? -NUDGE : NUDGE;
    if (axis === 0) { b.sx -= NUDGE; b.x += d / 2; }
    else if (axis === 1) { b.sy -= NUDGE; if (!end) b.y += NUDGE; }
    else { b.sz -= NUDGE; b.z += d / 2; }
  }
  return moves.size;
}
