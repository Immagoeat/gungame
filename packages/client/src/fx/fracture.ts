/** 2D fracture patterns for glass panes. Coordinates are in the pane's plane (u across, v up), meters. */
export type Poly = [number, number][];

export interface Shard {
  /** Outline relative to the shard's own centroid. */
  points: Poly;
  cx: number;
  cy: number;
  area: number;
  /** Distance of the centroid from the impact point. */
  dist: number;
  /** Touches the pane's frame. */
  edge: boolean;
}

function clip(poly: Poly, inside: (p: [number, number]) => number): Poly {
  // Sutherland-Hodgman against the half-plane inside(p) >= 0.
  const out: Poly = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = inside(a);
    const db = inside(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const clipRect = (poly: Poly, w: number, h: number): Poly => {
  let p = clip(poly, ([x]) => x + w / 2);
  p = clip(p, ([x]) => w / 2 - x);
  p = clip(p, ([, y]) => y + h / 2);
  return clip(p, ([, y]) => h / 2 - y);
};

function centroid(poly: Poly): { cx: number; cy: number; area: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cr = x0 * y1 - x1 * y0;
    a += cr;
    cx += (x0 + x1) * cr;
    cy += (y0 + y1) * cr;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { cx: poly[0][0], cy: poly[0][1], area: 0 };
  return { cx: cx / (6 * a), cy: cy / (6 * a), area: Math.abs(a) };
}

/** Cuts a polygon with a random line through a random interior point (not its centre), so pieces vary. */
function randomCut(p: Poly): [Poly, Poly] {
  const c = centroid(p);
  const v = p[Math.floor(Math.random() * p.length)];
  const t = 0.15 + Math.random() * 0.55;
  const px = c.cx + (v[0] - c.cx) * t;
  const py = c.cy + (v[1] - c.cy) * t;
  const a = Math.random() * Math.PI;
  const nx = Math.cos(a), ny = Math.sin(a);
  return [clip(p, ([x, y]) => (x - px) * nx + (y - py) * ny), clip(p, ([x, y]) => -((x - px) * nx + (y - py) * ny))];
}

/** A polygon cut into roughly cuts+1 irregular pieces, each recentred on its own centroid. */
export function splitPolygon(poly: Poly, cuts: number): { points: Poly; cx: number; cy: number; area: number }[] {
  let pieces: Poly[] = [poly];
  for (let i = 0; i < cuts; i++) {
    pieces.sort((a, b) => centroid(b).area - centroid(a).area);
    const [a, b] = randomCut(pieces[0]);
    pieces = [...pieces.slice(1), a, b].filter(q => q.length >= 3);
  }
  return pieces.map(q => {
    const c = centroid(q);
    return { points: q.map(([x, y]) => [x - c.cx, y - c.cy] as [number, number]), cx: c.cx, cy: c.cy, area: c.area };
  }).filter(q => q.area > 2e-5);
}

/**
 * Radial-and-ring fracture, like a bullet through annealed glass: many spokes radiate from the
 * impact, rings of cracks cross them at growing radii, and most cells are cut again at random so
 * the pieces are small, sharp and irregular: tiny near the hole, larger towards the frame.
 */
export function fracturePane(w: number, h: number, u0: number, v0: number): Shard[] {
  const spokes = 13 + Math.floor(Math.random() * 7);
  const angles: number[] = [];
  for (let i = 0; i < spokes; i++) angles.push(((i + 0.15 + Math.random() * 0.7) / spokes) * Math.PI * 2);
  const reach = Math.hypot(w, h) + 0.5;
  const radii: number[] = [0];
  let r = 0.025 + Math.random() * 0.025;
  while (r < reach) {
    radii.push(r);
    r *= 1.3 + Math.random() * 0.35;
  }
  radii.push(reach * 1.5);
  // Shared, jittered crack vertices so neighbouring shards fit together exactly.
  const pts = radii.map((rad, k) => angles.map(a => {
    const j = k === 0 ? 0 : rad * (0.72 + Math.random() * 0.56);
    const aj = a + (k === 0 ? 0 : (Math.random() - 0.5) * 0.12);
    return [u0 + Math.cos(aj) * j, v0 + Math.sin(aj) * j] as [number, number];
  }));
  const shards: Shard[] = [];
  const add = (poly: Poly, depth = 0) => {
    const p = clipRect(poly, w, h);
    if (p.length < 3) return;
    const c = centroid(p);
    if (c.area < 6e-5) return;
    // Cut big cells, and many small ones too, along random off-centre lines.
    const cutChance = c.area > 0.04 ? 1 : c.area > 0.006 ? 0.65 : c.area > 0.0015 ? 0.3 : 0;
    if (depth < 4 && Math.random() < cutChance) {
      const [a, b] = randomCut(p);
      add(a, depth + 1);
      add(b, depth + 1);
      return;
    }
    const edge = p.some(([x, y]) => Math.abs(Math.abs(x) - w / 2) < 0.01 || Math.abs(Math.abs(y) - h / 2) < 0.01);
    shards.push({
      points: p.map(([x, y]) => [x - c.cx, y - c.cy]),
      cx: c.cx, cy: c.cy, area: c.area, dist: Math.hypot(c.cx - u0, c.cy - v0), edge,
    });
  };
  for (let k = 0; k < radii.length - 1; k++) {
    for (let i = 0; i < spokes; i++) {
      const j = (i + 1) % spokes;
      if (k === 0) add([pts[0][0], pts[1][i], pts[1][j]]);
      else add([pts[k][i], pts[k + 1][i], pts[k + 1][j], pts[k][j]]);
    }
  }
  return shards;
}

/** Spider-web crack drawing for a pane that has been hit but not broken (transparent background). */
export function drawCracks(g: CanvasRenderingContext2D, s: number): void {
  g.clearRect(0, 0, s, s);
  const c = s / 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Build the crack paths once, then draw each with a dark edge and a bright core so they read
  // against both a bright sky and a dark room.
  const paths: [number, number][][] = [];
  const spokes = 10 + Math.floor(Math.random() * 6);
  for (let i = 0; i < spokes; i++) {
    let a = (i / spokes) * Math.PI * 2 + Math.random() * 0.3;
    let x = c, y = c;
    const len = s * (0.3 + Math.random() * 0.2);
    const path: [number, number][] = [[x, y]];
    for (let d = 0; d < len; d += 6) {
      a += (Math.random() - 0.5) * 0.35;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      path.push([x, y]);
    }
    paths.push(path);
  }
  for (let ring = 1; ring <= 3; ring++) {
    const rr = s * 0.06 * ring * ring * 0.8;
    const path: [number, number][] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) {
      const j = rr * (0.85 + Math.random() * 0.3);
      path.push([c + Math.cos(a) * j, c + Math.sin(a) * j]);
    }
    paths.push(path);
  }
  for (const [style, width] of [['rgba(40,50,60,0.55)', 3.2], ['rgba(255,255,255,0.95)', 1.3]] as const) {
    g.strokeStyle = style;
    g.lineWidth = width;
    for (const p of paths) {
      g.beginPath();
      g.moveTo(p[0][0], p[0][1]);
      for (const [x, y] of p.slice(1)) g.lineTo(x, y);
      g.stroke();
    }
  }
  // Frosted crush zone around the hole.
  const grd = g.createRadialGradient(c, c, 0, c, c, s * 0.08);
  grd.addColorStop(0, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(c, c, s * 0.018, 0, Math.PI * 2);
  g.fill();
}
