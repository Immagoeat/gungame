import { describe, expect, it } from 'vitest';
import { createMap, MAPS, type MapId } from './index';
import type { Block } from './types';

/** Visible faces of differently-drawn blocks that share a plane, face the same way and overlap (z-fighting). */
function coplanarFaces(blocks: Block[]): string[] {
  const bs = blocks.filter(b => !b.invisible && b.material !== 'water');
  const box = (b: Block) => ({ lo: [b.x - b.sx / 2, b.y, b.z - b.sz / 2], hi: [b.x + b.sx / 2, b.y + b.sy, b.z + b.sz / 2] });
  const B = bs.map(box);
  const grid = new Map<string, number[]>();
  B.forEach((b, i) => {
    for (let x = Math.floor(b.lo[0] / 4); x <= Math.floor(b.hi[0] / 4); x++) for (let z = Math.floor(b.lo[2] / 4); z <= Math.floor(b.hi[2] / 4); z++) {
      const k = `${x},${z}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }
  });
  const out: string[] = [];
  const seen = new Set<string>();
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  for (const list of grid.values()) for (let a = 0; a < list.length; a++) for (let c = a + 1; c < list.length; c++) {
    const i = Math.min(list[a], list[c]), j = Math.max(list[a], list[c]);
    if (seen.has(`${i}:${j}`)) continue;
    seen.add(`${i}:${j}`);
    if (bs[i].material === bs[j].material && (bs[i].tint ?? -1) === (bs[j].tint ?? -1)) continue;
    const p = B[i], q = B[j];
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      if (ov(p.lo[u], p.hi[u], q.lo[u], q.hi[u]) <= 0.005 || ov(p.lo[v], p.hi[v], q.lo[v], q.hi[v]) <= 0.005) continue;
      for (const end of [0, 1]) {
        if (axis === 1 && end === 0) continue;
        const fp = end ? p.hi[axis] : p.lo[axis], fq = end ? q.hi[axis] : q.lo[axis];
        if (Math.abs(fp - fq) < 0.002) out.push(`${bs[i].material}/${bs[j].material} at ${'xyz'[axis]}=${fp.toFixed(2)}`);
      }
    }
  }
  return out;
}

describe('no z-fighting', () => {
  for (const id of Object.keys(MAPS) as MapId[]) {
    it(`${id}: no two differently drawn faces share a plane`, () => {
      const faces = coplanarFaces(createMap(id).blocks);
      expect(faces.slice(0, 8), `${faces.length} coplanar faces`).toEqual([]);
    });
    it(`${id}: rugs lie on top of the floor under them`, () => {
      const map = createMap(id);
      for (const p of map.props) {
        if (p.kind !== 'furniture' || !['rug', 'roundRug', 'medallion', 'redCarpet'].includes(p.type)) continue;
        const under = map.blocks.filter(b => !b.invisible && Math.abs(p.x - b.x) <= b.sx / 2 && Math.abs(p.z - b.z) <= b.sz / 2 && b.y + b.sy > p.y - 0.02 && b.y + b.sy < p.y + 0.12);
        for (const b of under) expect(b.y + b.sy, `${p.type} at ${p.x},${p.z} under ${b.material}`).toBeLessThanOrEqual(p.y);
      }
    });
  }
});
