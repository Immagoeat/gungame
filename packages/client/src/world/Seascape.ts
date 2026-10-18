import * as THREE from 'three';
import { AURELIA_HULL_WINDOWS, halfBeam, SEA_LEVEL, SHIP } from '@gungame/shared';
import { canvasTexture } from './textures';

/**
 * The open sea round a ship (map backdrop 'openSea'): the ocean to the horizon scrolling past as the
 * ship steams ahead, the smooth outer hull below the waterline and round the bow and stern, the wake
 * and bow waves, the coast and other ships' lights far off. The sea, horizon and lights roll and
 * pitch gently together; the ship (the playable world) stays level, so physics never notices.
 */

/** Ship's speed (m/s): how fast the sea and the wake run past. */
const SPEED = 7;
const RADIUS = 840;
/** Top of the bulwark round deck 4, where the outer hull ends. */
const BULWARK = 8.1;

export class Seascape {
  private readonly group = new THREE.Group();
  /** What rolls: the sea, the wake, the far lights. */
  private readonly motion = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly waves: THREE.Texture;
  private readonly foam: THREE.Texture;
  private readonly nightMats: { mat: THREE.Material & { opacity: number }; max: number }[] = [];
  private readonly seaMat: THREE.MeshStandardMaterial;
  private time = 0;
  private lighthouse: THREE.PointsMaterial | null = null;
  private readonly windowMat: THREE.MeshBasicMaterial;

  constructor(root: THREE.Object3D) {
    // ---- The ocean.
    this.waves = waveNormals();
    this.waves.repeat.set(RADIUS / 9, RADIUS / 9);
    const seaGeo = new THREE.CircleGeometry(RADIUS, 96).rotateX(-Math.PI / 2);
    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x0b2236, roughness: 0.32, metalness: 0.3, normalMap: this.waves, normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 0.6,
    });
    const sea = new THREE.Mesh(seaGeo, this.seaMat);
    sea.position.y = SEA_LEVEL;
    sea.receiveShadow = true;
    this.motion.add(sea);
    this.disposables.push(seaGeo, this.seaMat, this.waves);

    // ---- Foam: the wake, the bow waves, a rim along the hull at the waterline.
    this.foam = foamTexture();
    this.disposables.push(this.foam);
    const foamMat = new THREE.MeshBasicMaterial({ map: this.foam, transparent: true, depthWrite: false, color: 0xdfeef5, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 });
    this.disposables.push(foamMat);
    const wake = wakeGeometry();
    this.disposables.push(wake);
    const wakeMesh = new THREE.Mesh(wake, foamMat);
    wakeMesh.position.y = SEA_LEVEL + 0.03;
    this.motion.add(wakeMesh);

    // ---- The outer hull: below the waterline all along, and the curved bow and stern up to the bulwark.
    const hull = hullGeometry();
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide });
    this.disposables.push(hull, hullMat);
    const hullMesh = new THREE.Mesh(hull, hullMat);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    this.group.add(hullMesh);

    // ---- The hull's windows, lit from inside (most cabins are occupied): panels just outside the
    // glass, facing out, so from inside you see straight through them.
    const winPos: number[] = [], winCol: number[] = [];
    const wr = mulberry(311);
    for (const side of [1, -1]) {
      for (const [x0, x1, y0, y1] of AURELIA_HULL_WINDOWS) {
        const lit = wr() < 0.68;
        const c = lit ? (wr() < 0.8 ? [1, 0.8, 0.52] : [0.75, 0.85, 1]) : [0.04, 0.05, 0.07];
        const z = side * (SHIP.beam + 0.215);
        const quad = side > 0
          ? [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]
          : [[x1, y0], [x0, y0], [x0, y1], [x1, y0], [x0, y1], [x1, y1]];
        for (const [x, y] of quad) { winPos.push(x, y, z); winCol.push(...c); }
      }
    }
    const winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
    winGeo.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
    this.windowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.disposables.push(winGeo, this.windowMat);
    this.group.add(new THREE.Mesh(winGeo, this.windowMat));

    // ---- Far away: the coast's lights on the horizon, a lighthouse, two other ships.
    const pts: number[] = [], cols: number[] = [];
    const rand = mulberry(77);
    for (let i = 0; i < 1400; i++) {
      // The coast lies off the starboard quarter, a band of lights along the horizon.
      const a = -0.35 + rand() * 1.5;
      const r = 780 + rand() * 40;
      const x = Math.cos(a + Math.PI * 0.75) * r, z = Math.sin(a + Math.PI * 0.75) * r;
      pts.push(x, SEA_LEVEL + 1 + rand() * rand() * 22, z);
      const warm = rand() < 0.7;
      cols.push(1, warm ? 0.72 : 0.92, warm ? 0.4 : 0.85);
    }
    for (const [sx, sz] of [[-420, 380], [520, -470]]) {
      for (let i = 0; i < 26; i++) { pts.push(sx + (rand() - 0.5) * 60, SEA_LEVEL + 2 + rand() * 9, sz + (rand() - 0.5) * 8); cols.push(1, 0.9, 0.7); }
      pts.push(sx - 30, SEA_LEVEL + 14, sz); cols.push(1, 0.2, 0.15);
      pts.push(sx + 30, SEA_LEVEL + 14, sz); cols.push(0.2, 1, 0.4);
    }
    this.addLights(pts, cols, 2.2);
    const lh = new THREE.BufferGeometry();
    lh.setAttribute('position', new THREE.Float32BufferAttribute([-560, SEA_LEVEL + 30, 560], 3));
    this.lighthouse = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, color: 0xfff4d0, transparent: true, depthWrite: false, fog: false });
    this.disposables.push(lh, this.lighthouse);
    this.motion.add(new THREE.Points(lh, this.lighthouse));

    this.group.add(this.motion);
    root.add(this.group);
  }

  private addLights(pts: number[], cols: number[], size: number): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.disposables.push(g, m);
    this.nightMats.push({ mat: m, max: 0.9 });
    this.motion.add(new THREE.Points(g, m));
  }

  /** @param night 0 day .. 1 night */
  update(dt: number, night: number): void {
    this.time += dt;
    // The sea runs aft past the hull; the foam with it, a little faster near the ship.
    this.waves.offset.x -= (SPEED * dt) / 9;
    this.waves.offset.y += dt * 0.01;
    this.foam.offset.x -= (SPEED * dt) / 40;
    // A slow roll and a slower pitch of everything outside the ship.
    const t = this.time;
    this.motion.rotation.x = Math.sin(t * 0.62) * 0.0085 + Math.sin(t * 0.23 + 1) * 0.004;
    this.motion.rotation.z = Math.sin(t * 0.41 + 0.5) * 0.004;
    this.motion.position.y = Math.sin(t * 0.52) * 0.12;
    this.seaMat.color.setHex(0x0b2236).lerp(new THREE.Color(0x2a6e93), 1 - night);
    this.windowMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.3, 0.33, 0.38), 1 - night);
    for (const n of this.nightMats) n.mat.opacity = THREE.MathUtils.smoothstep(night, 0.3, 0.9) * n.max;
    if (this.lighthouse) {
      // Sweeps round every eight seconds: a flash as it points this way.
      const k = Math.pow(Math.max(0, Math.cos((t / 8) * Math.PI * 2)), 24);
      this.lighthouse.opacity = THREE.MathUtils.smoothstep(night, 0.3, 0.9) * (0.15 + 0.85 * k);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}

/** The outer hull as one lofted mesh: navy below and at the waterline, a gold stripe, white above. */
function hullGeometry(): THREE.BufferGeometry {
  const keel = SEA_LEVEL - 6;
  // Half-width at a height, as a fraction of the deck's half-beam: a round bilge, a fine keel.
  const profile: [number, number][] = [[keel, 0.12], [keel + 1.2, 0.62], [keel + 3, 0.88], [SEA_LEVEL, 0.98], [0, 1.0], [BULWARK, 1.02]];
  const stations: number[] = [];
  for (let x = SHIP.stern - 0.6; x <= SHIP.bow - 0.2; x += 1) stations.push(x);
  stations.push(SHIP.bow);
  const pos: number[] = [], col: number[] = [];
  const navy = new THREE.Color(0x14213d), white = new THREE.Color(0xf4f5f3), gold = new THREE.Color(0xc9a456), red = new THREE.Color(0x5a1a18);
  const colourAt = (y: number) => (y < SEA_LEVEL - 0.6 ? red : y < 0.75 ? navy : y < 0.95 ? gold : white);
  // The midship sides above the waterline are the map's own walls (with windows): skin only below
  // y = 0.8 there, and the whole height at the curved ends.
  const top = (x: number) => (x > 33 || x < -61 ? BULWARK : 0.8);
  const point = (x: number, y: number, frac: number, side: number) => {
    // The stem rakes forward: the bow's half-beam shrinks faster low down.
    const hb = Math.max(0.05, halfBeam(x) + 0.28) * (x > 40 && y < 0 ? Math.max(0.1, 1 + y / 20) : 1);
    return [x, y, side * hb * frac];
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], ca: THREE.Color, cb: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const cc of [ca, cb, cb, ca, cb, ca]) col.push(cc.r, cc.g, cc.b);
  };
  for (const side of [1, -1]) {
    for (let i = 0; i < stations.length - 1; i++) {
      const x0 = stations[i], x1 = stations[i + 1];
      // Heights for this strip: the profile, then up to the top.
      const ys = profile.map(p => p[0]);
      const t0 = Math.min(top(x0), top(x1));
      const levels = [...ys.filter(y => y < t0), t0];
      for (let k = 0; k < levels.length - 1; k++) {
        const ya = levels[k], yb = levels[k + 1];
        const fa = fracAt(profile, ya), fb = fracAt(profile, yb);
        const a = point(x0, ya, fa, side), b = point(x0, yb, fb, side), c = point(x1, yb, fb, side), d = point(x1, ya, fa, side);
        if (side > 0) quad(a, d, c, b, colourAt(ya), colourAt(ya)); else quad(a, b, c, d, colourAt(ya), colourAt(ya));
      }
    }
  }
  // The transom: a flat stern from keel to bulwark.
  const xs = SHIP.stern - 0.6;
  const levels = [...profile.map(p => p[0]), BULWARK];
  for (let k = 0; k < levels.length - 1; k++) {
    const ya = levels[k], yb = levels[k + 1];
    const a = point(xs, ya, fracAt(profile, ya), -1), b = point(xs, yb, fracAt(profile, yb), -1);
    const c = point(xs, yb, fracAt(profile, yb), 1), d = point(xs, ya, fracAt(profile, ya), 1);
    quad(a, d, c, b, colourAt(ya), colourAt(ya));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function fracAt(profile: [number, number][], y: number): number {
  if (y <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (y <= profile[i][0]) {
      const [y0, f0] = profile[i - 1], [y1, f1] = profile[i];
      return f0 + (f1 - f0) * ((y - y0) / (y1 - y0));
    }
  }
  return profile[profile.length - 1][1];
}

/** The wake: a widening band of churned water astern, two bow waves, and foam along the hull. */
function wakeGeometry(): THREE.BufferGeometry {
  const parts: number[] = [], uvs: number[] = [];
  const strip = (pts: [number, number, number][]) => {
    // pts: [x, z centre, half-width] along the strip.
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0, w0] = pts[i], [x1, z1, w1] = pts[i + 1];
      const quad = [[x0, z0 - w0], [x0, z0 + w0], [x1, z1 + w1], [x1, z1 - w1]];
      const u0 = i / (pts.length - 1), u1 = (i + 1) / (pts.length - 1);
      const uv = [[u0 * 8, 0], [u0 * 8, 1], [u1 * 8, 1], [u1 * 8, 0]];
      for (const k of [0, 1, 2, 0, 2, 3]) { parts.push(quad[k][0], 0, quad[k][1]); uvs.push(uv[k][0], uv[k][1]); }
    }
  };
  const astern: [number, number, number][] = [];
  for (let d = 0; d <= 320; d += 16) astern.push([SHIP.stern - 1 - d, 0, 7 + d * 0.12]);
  strip(astern);
  for (const side of [1, -1]) {
    const bow: [number, number, number][] = [];
    for (let d = 0; d <= 160; d += 10) bow.push([SHIP.bow - 6 - d, side * (halfBeam(Math.max(-60, SHIP.bow - 6 - d)) + 0.6 + d * 0.32), 0.8 + d * 0.025]);
    strip(bow);
    const rim: [number, number, number][] = [];
    for (let x = SHIP.stern; x <= SHIP.bow - 4; x += 4) rim.push([x, side * (halfBeam(x) + 0.55), 0.45]);
    strip(rim);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Choppy water as a normal map: a few overlapping wave trains. */
export function waveNormals(): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  const h = (x: number, y: number) => {
    const u = (x / s) * Math.PI * 2, v = (y / s) * Math.PI * 2;
    return Math.sin(u * 3 + v * 1) * 0.5 + Math.sin(u * 5 - v * 4 + 1.3) * 0.3 + Math.sin(u * 11 + v * 7 + 2.1) * 0.15 + Math.sin(-u * 2 + v * 9 + 0.7) * 0.2;
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
      const i = (y * s + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Streaky white foam that thins towards the edges (alpha). */
function foamTexture(): THREE.Texture {
  const t = canvasTexture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * s;
      const edge = Math.abs(y / s - 0.5) * 2;
      const a = (1 - edge * edge) * (0.15 + Math.random() * 0.35);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(Math.random() * s, y, 4 + Math.random() * 26, 1 + Math.random() * 2.5);
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
