import type { AABB } from '../physics/aabb';
import type { Vec3 } from '../math/vec';

/**
 * Walkable-space graph for AI, built from a map's collision boxes: the map is sampled on a grid of
 * columns; every surface in a column a person can stand on (with headroom) is a node, and nodes in
 * neighbouring columns join when the step between them is small enough to walk. Stairs, every floor
 * of a building and the ground outside all come out of the same rule. Pure data, so the server can
 * build it too.
 */

export interface NavOptions {
  /** Cell size, meters. */
  cell?: number;
  /** Body radius used for clearance. */
  radius?: number;
  /** Headroom needed above a surface. */
  height?: number;
  /** Largest ledge a body steps up (clearance). */
  step?: number;
  /** Largest height change between neighbouring cells (steep stairs climb more than one riser per cell). */
  climb?: number;
  /** Area covered: -half..half on x and z (or explicit bounds). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Water volumes: cells under water aren't walkable. */
  water?: readonly AABB[];
}

const TILE = 4;

/** Spatial hash of boxes on a coarse xz grid, for fast "which boxes are near here" queries. */
class BoxIndex {
  private readonly tiles = new Map<number, number[]>();
  constructor(readonly boxes: readonly AABB[]) {
    boxes.forEach((b, i) => {
      for (let tx = Math.floor(b.min.x / TILE); tx <= Math.floor(b.max.x / TILE); tx++) {
        for (let tz = Math.floor(b.min.z / TILE); tz <= Math.floor(b.max.z / TILE); tz++) {
          const k = key(tx, tz);
          let list = this.tiles.get(k);
          if (!list) this.tiles.set(k, (list = []));
          list.push(i);
        }
      }
    });
  }
  near(x: number, z: number): number[] {
    return this.tiles.get(key(Math.floor(x / TILE), Math.floor(z / TILE))) ?? [];
  }
}
const key = (tx: number, tz: number) => (tx + 4096) * 8192 + (tz + 4096);

export class NavGrid {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  /** Node positions (x, y, z interleaved). */
  readonly pos: Float32Array;
  /** Per column: first node index and count (nodes sorted by height). */
  private readonly colStart: Int32Array;
  private readonly colCount: Uint8Array;
  /** Adjacency (CSR): neighbours of node i are adj[adjStart[i] .. adjStart[i+1]). */
  private readonly adjStart: Int32Array;
  private readonly adj: Int32Array;
  readonly nodeCount: number;
  private readonly step: number;
  private search: { g: Float32Array; came: Int32Array; stamp: Uint32Array; closed: Uint32Array; id: number } | null = null;

  constructor(colliders: readonly AABB[], o: NavOptions) {
    const cell = (this.cell = o.cell ?? 0.5);
    const r = o.radius ?? 0.3;
    const h = o.height ?? 1.7;
    const step = o.step ?? 0.45;
    const climb = (this.step = o.climb ?? 0.72);
    this.minX = o.bounds.minX;
    this.minZ = o.bounds.minZ;
    this.cols = Math.ceil((o.bounds.maxX - o.bounds.minX) / cell);
    this.rows = Math.ceil((o.bounds.maxZ - o.bounds.minZ) / cell);
    const index = new BoxIndex(colliders);
    const water = o.water ?? [];

    const fits = (x: number, y: number, z: number, near: number[]) => {
      for (const i of near) {
        const b = colliders[i];
        // A box whose top is within a step of the feet is a stair or kerb you walk up, not an obstacle.
        if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + h > b.min.y && b.max.y > y + step) return false;
      }
      for (const w of water) {
        if (x > w.min.x && x < w.max.x && z > w.min.z && z < w.max.z && y < w.max.y && y + 0.3 > w.min.y) return false;
      }
      return true;
    };

    // 1. Nodes: standable surfaces per column.
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    this.colStart = new Int32Array(this.cols * this.rows);
    this.colCount = new Uint8Array(this.cols * this.rows);
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.minX + (cx + 0.5) * cell;
        const z = this.minZ + (cz + 0.5) * cell;
        const near = index.near(x, z);
        const tops = new Set<number>([0]);
        for (const i of near) {
          const b = colliders[i];
          if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) tops.add(Math.round(b.max.y * 100) / 100);
        }
        const c = cz * this.cols + cx;
        this.colStart[c] = xs.length;
        for (const y of [...tops].sort((a, b) => a - b)) {
          // Standing on this top: something must be under the feet (or it's the ground), and room above.
          if (!fits(x, y, z, near)) continue;
          if (this.colCount[c] === 255) break;
          xs.push(x); ys.push(y); zs.push(z);
          this.colCount[c]++;
        }
      }
    }
    this.nodeCount = xs.length;
    this.pos = new Float32Array(this.nodeCount * 3);
    for (let i = 0; i < this.nodeCount; i++) this.pos.set([xs[i], ys[i], zs[i]], i * 3);

    // 2. Edges: to nodes in the 8 neighbouring columns within a step; diagonals need both sides open.
    const lists: number[][] = Array.from({ length: this.nodeCount }, () => []);
    const at = (cx: number, cz: number, y: number) => this.nodeIn(cx, cz, y, climb);
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const c = cz * this.cols + cx;
        for (let k = 0; k < this.colCount[c]; k++) {
          const n = this.colStart[c] + k;
          const y = ys[n];
          for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
            const m = at(cx + dx, cz + dz, y);
            if (m < 0) continue;
            if (dx !== 0 && dz !== 0 && (at(cx + dx, cz, y) < 0 || at(cx, cz + dz, y) < 0)) continue;
            lists[n].push(m);
            lists[m].push(n);
          }
        }
      }
    }
    this.adjStart = new Int32Array(this.nodeCount + 1);
    let total = 0;
    for (let i = 0; i < this.nodeCount; i++) { this.adjStart[i] = total; total += lists[i].length; }
    this.adjStart[this.nodeCount] = total;
    this.adj = new Int32Array(total);
    lists.forEach((l, i) => this.adj.set(l, this.adjStart[i]));
  }

  /** The node in a column closest in height to y, within `tolerance`; -1 if none. */
  private nodeIn(cx: number, cz: number, y: number, tolerance: number): number {
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return -1;
    const c = cz * this.cols + cx;
    let best = -1;
    let bestD = tolerance;
    for (let k = 0; k < this.colCount[c]; k++) {
      const n = this.colStart[c] + k;
      const d = Math.abs(this.pos[n * 3 + 1] - y);
      if (d <= bestD) { bestD = d; best = n; }
    }
    return best;
  }

  point(n: number): Vec3 {
    return { x: this.pos[n * 3], y: this.pos[n * 3 + 1], z: this.pos[n * 3 + 2] };
  }

  /** The walkable node nearest a point (searching nearby columns), or -1. */
  nearest(p: Vec3, searchRadius = 2): number {
    const cx0 = Math.floor((p.x - this.minX) / this.cell);
    const cz0 = Math.floor((p.z - this.minZ) / this.cell);
    const reach = Math.ceil(searchRadius / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const n = this.nodeIn(cx0 + dx, cz0 + dz, p.y, 1.2);
        if (n < 0) continue;
        const d = (this.pos[n * 3] - p.x) ** 2 + ((this.pos[n * 3 + 1] - p.y) * 3) ** 2 + (this.pos[n * 3 + 2] - p.z) ** 2;
        if (d < bestD) { bestD = d; best = n; }
      }
    }
    return best;
  }

  /**
   * Shortest walkable route between two points, as a list of waypoints (smoothed: corners only),
   * or null if there's no way. `blocked` can veto nodes (e.g. occupied or dangerous).
   */
  findPath(from: Vec3, to: Vec3, maxNodes = 40000): Vec3[] | null {
    const start = this.nearest(from);
    const goal = this.nearest(to);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [this.point(goal)];
    // Search buffers are reused between searches; a stamp marks which entries belong to this one.
    if (!this.search) this.search = { g: new Float32Array(this.nodeCount), came: new Int32Array(this.nodeCount), stamp: new Uint32Array(this.nodeCount), closed: new Uint32Array(this.nodeCount), id: 0 };
    const sb = this.search;
    const id = ++sb.id;
    const { g, came, stamp, closed: closedAt } = sb;
    const visit = (n: number) => { if (stamp[n] !== id) { stamp[n] = id; g[n] = Infinity; came[n] = -1; } };
    const heap = new MinHeap();
    visit(start);
    visit(goal);
    const gx = this.pos[goal * 3], gy = this.pos[goal * 3 + 1], gz = this.pos[goal * 3 + 2];
    const hfn = (n: number) => Math.hypot(this.pos[n * 3] - gx, (this.pos[n * 3 + 1] - gy) * 1.5, this.pos[n * 3 + 2] - gz);
    g[start] = 0;
    heap.push(start, hfn(start));
    let expanded = 0;
    while (heap.size) {
      const n = heap.pop();
      if (n === goal) break;
      if (closedAt[n] === id) continue;
      closedAt[n] = id;
      if (++expanded > maxNodes) return null;
      const px = this.pos[n * 3], py = this.pos[n * 3 + 1], pz = this.pos[n * 3 + 2];
      for (let k = this.adjStart[n]; k < this.adjStart[n + 1]; k++) {
        const m = this.adj[k];
        if (closedAt[m] === id) continue;
        visit(m);
        const cost = g[n] + Math.hypot(this.pos[m * 3] - px, (this.pos[m * 3 + 1] - py) * 2, this.pos[m * 3 + 2] - pz);
        if (cost < g[m]) {
          g[m] = cost;
          came[m] = n;
          heap.push(m, cost + hfn(m));
        }
      }
    }
    if (came[goal] < 0) return null;
    const nodes: number[] = [];
    for (let n = goal; n >= 0; n = came[n]) nodes.push(n);
    nodes.reverse();
    return this.smooth(nodes);
  }

  /** Can you walk straight from node a to node b (every cell on the line walkable, small steps)? */
  private straight(a: number, b: number): boolean {
    const ax = this.pos[a * 3], ay = this.pos[a * 3 + 1], az = this.pos[a * 3 + 2];
    const bx = this.pos[b * 3], bz = this.pos[b * 3 + 2];
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / (this.cell * 0.5));
    let y = ay;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const n = this.nodeIn(Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell), y, this.step);
      if (n < 0) return false;
      y = this.pos[n * 3 + 1];
    }
    return true;
  }

  /** Drops waypoints that can be skipped by walking straight. */
  private smooth(nodes: number[]): Vec3[] {
    const out = [this.point(nodes[0])];
    let anchor = 0;
    for (let i = 2; i < nodes.length; i++) {
      if (!this.straight(nodes[anchor], nodes[i])) {
        out.push(this.point(nodes[i - 1]));
        anchor = i - 1;
      }
    }
    out.push(this.point(nodes[nodes.length - 1]));
    return out;
  }

  /** A random walkable point within `radius` of p (for searching and wandering), or null. */
  randomNear(p: Vec3, radius: number, rand: () => number = Math.random): Vec3 | null {
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * radius;
      const n = this.nearest({ x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d }, 1);
      if (n >= 0) return this.point(n);
    }
    return null;
  }
}

/** Binary min-heap of node indices by priority. */
class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size(): number { return this.ids.length; }
  push(id: number, p: number): void {
    const ids = this.ids, pri = this.pri;
    let i = ids.length;
    ids.push(id); pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent]; pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id; pri[i] = p;
  }
  pop(): number {
    const ids = this.ids, pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pri.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lastP) break;
        ids[i] = ids[c]; pri[i] = pri[c];
        i = c;
      }
      ids[i] = lastId; pri[i] = lastP;
    }
    return top;
  }
}
