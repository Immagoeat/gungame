import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NEIGHBOR_DRIVES, STREET_LAMPS, STREET_PALMS } from '@gungame/shared';

/**
 * Beverly Hills around the Mansion, as cheap scenery (nothing here is solid or casts shadows; the
 * map has colliders for the street trees and lamps):
 *  - neighbouring estates behind ficus hedges: Mediterranean villas with terracotta hip roofs and a
 *    few modern white boxes, windows lit at night, pools glowing in back gardens;
 *  - tall Mexican fan palms lining the street (instanced), ornate lamps with pools of light;
 *  - the canyon rising behind the estate, dotted with house lights and winding roads;
 *  - the lights of the LA basin spreading south, and the Century City towers.
 * Everything is merged into a handful of meshes (about fifteen draw calls). Distant pieces use a
 * longer fog than the scene's so the hills and city read through the haze. Keep it all inside the
 * night sky sphere (880 m), which draws over anything beyond it.
 */

const G = 4.2;
/** Fog distance multiplier for far scenery (hills, city). */
const FAR_FOG = 0.3;

type Rand = () => number;
function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ground height of the surroundings: flat around the estate and its neighbours, the canyon rising behind (north), hills east and west, the basin falling away south. */
export function terrainHeight(x: number, z: number): number {
  const ss = THREE.MathUtils.smoothstep;
  const north = Math.pow(ss(-z, 58, 420), 1.5) * (115 + 35 * Math.sin(x * 0.0085) + 16 * Math.sin(x * 0.024 + 1.3));
  const side = Math.pow(ss(Math.abs(x), 170, 560), 1.5) * (55 + 20 * Math.sin(z * 0.011 + x * 0.004)) * (1 - ss(z, 150, 520) * 0.8);
  const south = -Math.min(14, Math.max(0, z - 175) * 0.02);
  const rise = Math.max(north, side);
  const rough = rise > 2 ? Math.sin(x * 0.051) * Math.cos(z * 0.043) * 4 + Math.sin(x * 0.13 + z * 0.09) * 1.5 : 0;
  return G - 0.6 + rise + rough + south;
}

/** Fog that thickens over a longer distance (for scenery hundreds of meters away). */
function farFog<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>',
      THREE.ShaderChunk.fog_fragment.replace(/vFogDepth/g, `(vFogDepth * ${FAR_FOG.toFixed(2)})`));
  };
  m.customProgramCacheKey = () => 'farFog';
  return m;
}

/** Geometry collected per material, merged at the end. */
class Bucket {
  readonly parts: THREE.BufferGeometry[] = [];
  /** A box standing on y, centred on x/z, turned by yaw, in one colour. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color | number, yaw = 0): void {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(0, sy / 2, 0);
    g.rotateY(yaw);
    g.translate(x, y, z);
    this.add(g, color);
  }
  add(g: THREE.BufferGeometry, color: THREE.Color | number): void {
    const geo = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    this.parts.push(geo);
  }
  merge(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}

/** A hip roof over a w × d rectangle (ridge along the longer side), standing on y. */
function hipRoof(w: number, d: number, h: number, overhang: number): THREE.BufferGeometry {
  const swap = d > w;
  const W = (swap ? d : w) / 2 + overhang, D = (swap ? w : d) / 2 + overhang;
  const r = Math.max(0, W - D);
  const v = (x: number, y: number, z: number) => [x, y, z];
  const a = v(-W, 0, -D), b = v(W, 0, -D), c = v(W, 0, D), e = v(-W, 0, D), p = v(-r, h, 0), q = v(r, h, 0);
  const tris = [a, p, q, a, q, b, b, q, c, c, q, p, c, p, e, e, p, a];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  if (swap) g.rotateY(Math.PI / 2);
  return g;
}

const WALLS_MED = [0xf0e4cf, 0xf4e9d8, 0xead6bd, 0xf6efe4, 0xe8dcc4];
const ROOFS = [0xb2553a, 0xa64c33, 0xbd6446, 0x9f5136];
const WALLS_MODERN = [0xf2f2ee, 0xe9e8e3, 0xf7f6f2];
const LIT = [new THREE.Color(1, 0.78, 0.46), new THREE.Color(1, 0.86, 0.6), new THREE.Color(0.78, 0.86, 1)];
const DARK = new THREE.Color(0.05, 0.06, 0.08);

export class Neighborhood {
  private readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  /** Materials whose look follows the time of day: [material, day colour, night colour, opacity by night?]. */
  private readonly timed: { mat: THREE.Material & { color?: THREE.Color; opacity: number }; day: THREE.Color | null; night: THREE.Color | null; fadeIn: boolean; max?: number }[] = [];
  private lastNight = -1;

  constructor(root: THREE.Object3D) {
    const rand = rng(1931);
    const walls = new Bucket(), roofs = new Bucket(), windows = new Bucket(), hedges = new Bucket(), paving = new Bucket(), pools = new Bucket();
    const palms: THREE.Matrix4[] = [];
    const glows: number[] = [];
    const glowCols: number[] = [];

    const palm = (x: number, y: number, z: number, h: number) => {
      palms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.3), new THREE.Vector3(1, h, 1)));
    };

    // ---- Estates.
    const estate = (x: number, z: number, yaw: number, modern: boolean, y = G) => {
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const at = (along: number, out: number) => new THREE.Vector3(x, y, z).addScaledVector(right, along).addScaledVector(fwd, out);
      const wallCol = modern ? WALLS_MODERN[Math.floor(rand() * WALLS_MODERN.length)] : WALLS_MED[Math.floor(rand() * WALLS_MED.length)];
      const roofCol = ROOFS[Math.floor(rand() * ROOFS.length)];
      const masses: { c: THREE.Vector3; w: number; d: number; floors: number }[] = [];
      const mw = 22 + rand() * 10, md = 13 + rand() * 4;
      masses.push({ c: at(0, 0), w: mw, d: md, floors: 2 });
      const side = rand() < 0.5 ? -1 : 1;
      const ww = 10 + rand() * 5, wd = 10 + rand() * 4;
      masses.push({ c: at(side * (mw / 2 + ww / 2 - 1), -(wd - md) / 2 - 2), w: ww, d: wd, floors: rand() < 0.5 ? 1 : 2 });
      masses.push({ c: at(-side * (mw / 2 + 4), 2), w: 8, d: 9, floors: 1 });
      for (const m of masses) {
        const h = m.floors * 3.7;
        walls.box(m.c.x, y - 1, m.c.z, m.w, h + 1, m.d, wallCol, yaw);
        if (modern) {
          // Flat roof with a thin overhanging slab and a darker band.
          walls.box(m.c.x, y + h, m.c.z, m.w + 1.6, 0.35, m.d + 1.6, 0xdcdad4, yaw);
          walls.box(m.c.x, y + h - 0.9, m.c.z, m.w + 0.06, 0.5, m.d + 0.06, 0x3a3631, yaw);
        } else {
          const roof = hipRoof(m.w, m.d, Math.min(m.w, m.d) * 0.28, 0.7);
          roof.rotateY(yaw);
          roof.translate(m.c.x, y + h, m.c.z);
          roofs.add(roof, roofCol);
          if (rand() < 0.6) walls.box(m.c.x + right.x * m.w * 0.25, y + h, m.c.z + right.z * m.w * 0.25, 1, 2.6, 1, wallCol, yaw);
        }
        // Windows on all four sides, two kinds of light; modern houses get big panes.
        for (let f = 0; f < m.floors; f++) {
          for (const face of [0, 1, 2, 3]) {
            const len = face % 2 === 0 ? m.w : m.d;
            const depth = face % 2 === 0 ? m.d : m.w;
            const step = modern ? 4.2 : 2.9;
            const count = Math.max(1, Math.floor((len - 2) / step));
            for (let i = 0; i < count; i++) {
              const along = (i - (count - 1) / 2) * step;
              const lit = rand() < (f === 0 ? 0.55 : 0.4);
              const col = lit ? LIT[rand() < 0.75 ? 0 : rand() < 0.6 ? 1 : 2] : DARK;
              const ww2 = modern ? 3.3 : 1.25, wh = modern ? 2.7 : 1.9;
              const fy = y + f * 3.7 + (modern ? 0.4 : 0.9);
              const n = face === 0 ? fwd : face === 2 ? fwd.clone().negate() : face === 1 ? right : right.clone().negate();
              const t = face === 0 || face === 2 ? right : fwd;
              const p = m.c.clone().addScaledVector(n, depth / 2 + 0.03).addScaledVector(t, along);
              windows.box(p.x, fy, p.z, ww2, wh, 0.1, col, face === 0 || face === 2 ? yaw : yaw + Math.PI / 2);
            }
          }
        }
      }
      // Back garden: a pool glowing at night, palms around the house.
      const pool = at(side * -4, -md / 2 - 9);
      const pg = new THREE.PlaneGeometry(11, 4.6).rotateX(-Math.PI / 2).rotateY(yaw).translate(pool.x, y + 0.04, pool.z);
      pools.add(pg, 0x36c6ff);
      paving.box(pool.x, y - 0.02, pool.z, 15, 0.05, 8.5, 0xd8cfbf, yaw);
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        const p = at(Math.cos(a) * (mw / 2 + 6 + rand() * 6), Math.sin(a) * (md / 2 + 5 + rand() * 6));
        palm(p.x, y, p.z, 13 + rand() * 9);
      }
      return { at, fwd };
    };

    // Across the street, facing it (north), one behind each gated driveway.
    NEIGHBOR_DRIVES.forEach((dx, i) => {
      const modern = i % 3 === 1;
      const { at } = estate(dx + (rand() - 0.5) * 6, 88 + rand() * 8, 0, modern);
      // Driveway from the gate to the house, low hedges inside the front hedge.
      const front = at(0, 0);
      paving.box(dx, G - 0.02, (60.8 + front.z - 8) / 2, 4.4, 0.05, front.z - 8 - 60.8, 0xd6cdbd);
      hedges.box(dx - 22, G, 63.2, 40, 1.4, 1.2, 0x2f4a26);
      for (const sx of [-1, 1]) glowAt(dx + sx * 2.6, G + 3.3, 61.0, 0xffd9a0);
    });
    // The neighbours either side of the estate, beyond its walls, facing away from it.
    for (const sx of [-1, 1]) {
      for (const z of [-24, 22]) estate(sx * (88 + rand() * 10), z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, rand() < 0.35);
      // Their side hedges along the estate wall.
      hedges.box(sx * 49, G, 0, 2, 4.2, 92, 0x2d4724);
    }
    // Up the canyon behind: villas on terraced pads, looking south over the city.
    const hillHouses: [number, number][] = [[-110, -95], [-48, -118], [12, -102], [70, -126], [128, -98], [-150, -150], [-80, -175], [40, -170], [110, -190], [-20, -215]];
    for (const [hx, hz] of hillHouses) {
      const hy = Math.min(terrainHeight(hx - 15, hz - 10), terrainHeight(hx + 15, hz - 10), terrainHeight(hx - 15, hz + 10), terrainHeight(hx + 15, hz + 10));
      paving.box(hx, hy - 3, hz, 44, 3.05, 30, 0xb9ad98); // retaining pad
      estate(hx, hz, Math.PI, rand() < 0.4, hy);
    }

    // ---- The street: fan palms, lamps with glows and pools of light.
    for (const [x, z] of STREET_PALMS) palm(x, G, z, 17 + rand() * 8);
    for (const [x, z] of STREET_LAMPS) glowAt(x, G + 4.85, z, 0xffc98a);

    function glowAt(x: number, y: number, z: number, color: number) {
      glows.push(x, y, z);
      const c = new THREE.Color(color);
      glowCols.push(c.r, c.g, c.b);
    }

    // ---- Meshes.
    const std = (opts: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, ...opts });
      this.disposables.push(m);
      return m;
    };
    const addMesh = (b: Bucket, mat: THREE.Material) => {
      const g = b.merge();
      if (!g) return null;
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.disposables.push(g);
      return mesh;
    };
    addMesh(walls, std({}));
    addMesh(roofs, std({ roughness: 0.8 }));
    addMesh(hedges, std({ roughness: 1 }));
    addMesh(paving, std({}));
    const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.disposables.push(windowMat);
    this.timed.push({ mat: windowMat, day: new THREE.Color(0.32, 0.34, 0.38), night: new THREE.Color(1, 1, 1), fadeIn: false });
    addMesh(windows, windowMat);
    const poolMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.disposables.push(poolMat);
    this.timed.push({ mat: poolMat, day: new THREE.Color(0.55, 0.75, 0.85), night: new THREE.Color(0.9, 1, 1), fadeIn: false });
    addMesh(pools, poolMat);

    // Palms: trunk, a skirt of dead fronds, the crown (instanced: three draw calls for all of them).
    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.3, 1, 7, 1, true).translate(0, 0.5, 0);
    const crownGeo = palmCrown();
    const skirtGeo = new THREE.ConeGeometry(1.0, 2.2, 7, 1, true);
    const trunkMat = std({ vertexColors: false, color: 0x6b5a48 });
    const crownMat = std({ vertexColors: false, color: 0x355226, side: THREE.DoubleSide });
    const skirtMat = std({ vertexColors: false, color: 0x7a6447, side: THREE.DoubleSide });
    this.disposables.push(trunkGeo, crownGeo, skirtGeo);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palms.length);
    const skirts = new THREE.InstancedMesh(skirtGeo, skirtMat, palms.length);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    palms.forEach((m, i) => {
      trunks.setMatrixAt(i, m);
      m.decompose(pos, quat, scl);
      const top = pos.clone().setY(pos.y + scl.y);
      crowns.setMatrixAt(i, new THREE.Matrix4().compose(top, quat, new THREE.Vector3(1, 1, 1)));
      skirts.setMatrixAt(i, new THREE.Matrix4().compose(top.clone().setY(top.y - 0.8), quat, new THREE.Vector3(1, 1, 1)));
    });
    for (const im of [trunks, crowns, skirts]) { im.computeBoundingSphere(); this.group.add(im); }

    // Street lamps: a post and a lantern each.
    const postGeo = new THREE.CylinderGeometry(0.07, 0.11, 4.6, 6).translate(0, 2.3, 0);
    const headGeo = new THREE.CylinderGeometry(0.22, 0.14, 0.55, 6).translate(0, 4.85, 0);
    this.disposables.push(postGeo, headGeo);
    const posts = new THREE.InstancedMesh(postGeo, std({ vertexColors: false, color: 0x1d2024, metalness: 0.6, roughness: 0.5 }), STREET_LAMPS.length);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    this.disposables.push(headMat);
    this.timed.push({ mat: headMat, day: new THREE.Color(0.45, 0.45, 0.42), night: new THREE.Color(1, 0.88, 0.66), fadeIn: false });
    const heads = new THREE.InstancedMesh(headGeo, headMat, STREET_LAMPS.length);
    STREET_LAMPS.forEach(([x, z], i) => {
      const m = new THREE.Matrix4().makeTranslation(x, G, z);
      posts.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    for (const im of [posts, heads]) { im.computeBoundingSphere(); this.group.add(im); }

    // Pools of lamplight on the road and sidewalk (additive discs), and the glow round each lantern.
    const disc = radialTexture();
    this.disposables.push(disc);
    const poolParts: THREE.BufferGeometry[] = [];
    for (const [x, z] of STREET_LAMPS) poolParts.push(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(x, G + 0.06, z + (z < 52 ? 1.5 : -1.5)));
    const lightPoolGeo = mergeGeometries(poolParts);
    for (const p of poolParts) p.dispose();
    const lightPoolMat = new THREE.MeshBasicMaterial({ map: disc, color: 0xffb870, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.disposables.push(lightPoolGeo, lightPoolMat);
    this.timed.push({ mat: lightPoolMat, day: null, night: null, fadeIn: true, max: 0.32 });
    this.group.add(new THREE.Mesh(lightPoolGeo, lightPoolMat));
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
    glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(glowCols, 3));
    const glowMat = new THREE.PointsMaterial({ map: disc, size: 2.6, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.disposables.push(glowGeo, glowMat);
    this.timed.push({ mat: glowMat, day: null, night: null, fadeIn: true, max: 0.85 });
    this.group.add(new THREE.Points(glowGeo, glowMat));

    // ---- Far away: the hills, their lights, the city, Century City.
    this.buildTerrain(rand, std);
    this.buildCity(rand);

    for (const o of this.group.children) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.updateMatrix();
    }
    root.add(this.group);
  }

  /** The canyon and hills: one mesh, skipping what's hidden under the estate's own ground. */
  private buildTerrain(rand: Rand, std: (o: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial): void {
    const R = 840, N = 150;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, N, N).rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position');
    const cols = new Float32Array(p.count * 3);
    const low = new THREE.Color(0x58563a), brush = new THREE.Color(0x34432b), dry = new THREE.Color(0x7d7452);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = terrainHeight(x, z);
      p.setY(i, h);
      const k = THREE.MathUtils.clamp((h - G) / 120, 0, 1);
      c.copy(low).lerp(brush, Math.min(1, k * 1.6 + Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.25)).lerp(dry, Math.max(0, Math.sin(x * 0.02 + z * 0.03)) * 0.3);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // Drop triangles under the estate's flat ground, or beyond the sky.
    const idx = geo.getIndex()!;
    const keep: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const inside = v.every(i => Math.abs(p.getX(i)) < 160 && Math.abs(p.getZ(i)) < 160 && p.getY(i) < G + 0.05);
      const far = v.some(i => Math.hypot(p.getX(i), p.getZ(i)) > R);
      if (!inside && !far) keep.push(...v);
    }
    geo.setIndex(keep);
    geo.computeVertexNormals();
    geo.deleteAttribute('uv');
    const mat = farFog(std({ roughness: 1 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.disposables.push(geo);

    // House lights scattered up the slopes, and a few roads winding up the canyon.
    const pts: number[] = [], pc: number[] = [];
    const light = (x: number, z: number, warm = rand() < 0.75) => {
      pts.push(x, terrainHeight(x, z) + 1.6, z);
      const col = warm ? new THREE.Color(1, 0.78 + rand() * 0.1, 0.45) : new THREE.Color(0.85, 0.9, 1);
      pc.push(col.r, col.g, col.b);
    };
    for (let i = 0; i < 2600 && pts.length < 1500 * 3; i++) {
      const x = (rand() - 0.5) * 1600, z = (rand() - 0.5) * 1600;
      if (Math.hypot(x, z) > R - 40) continue;
      const h = terrainHeight(x, z) - G;
      if (h < 10 || rand() > 0.55) continue;
      light(x, z);
    }
    for (let r = 0; r < 5; r++) {
      let x = (rand() - 0.5) * 500, z = -70 - rand() * 40;
      let dir = -Math.PI / 2 + (rand() - 0.5);
      for (let s = 0; s < 60; s++) {
        dir += (rand() - 0.5) * 0.5;
        x += Math.cos(dir) * 14;
        z += Math.sin(dir) * 14 - 4;
        if (Math.hypot(x, z) > R - 40) break;
        light(x, z, true);
      }
    }
    this.addLights(pts, pc, 2.2);
  }

  /** The basin south of the hills: a grid of street lights, and Century City's towers. */
  private buildCity(rand: Rand): void {
    const pts: number[] = [], pc: number[] = [];
    const R = 830;
    const sodium = new THREE.Color(1, 0.68, 0.33), white = new THREE.Color(1, 0.94, 0.82);
    const signs = [new THREE.Color(1, 0.3, 0.3), new THREE.Color(0.4, 1, 0.6), new THREE.Color(0.5, 0.7, 1)];
    const add = (x: number, z: number) => {
      if (Math.hypot(x, z) > R) return;
      pts.push(x, terrainHeight(x, z) + 0.5, z);
      const c = rand() < 0.62 ? sodium : rand() < 0.9 ? white : signs[Math.floor(rand() * 3)];
      pc.push(c.r, c.g, c.b);
    };
    for (let z = 230; z < R; z += 24) for (let x = -R; x < R; x += 7 + rand() * 6) add(x + rand() * 2, z + (rand() - 0.5) * 2);
    for (let x = -R; x < R; x += 36) for (let z = 230; z < R; z += 9 + rand() * 6) add(x + (rand() - 0.5) * 2, z);
    this.addLights(pts, pc, 1.7);

    // Century City, to the south-east: glass towers with lit floors, red lights on top.
    const tex = windowTexture(rand);
    this.disposables.push(tex);
    const parts: THREE.BufferGeometry[] = [];
    const tops: number[] = [], topCols: number[] = [];
    for (let i = 0; i < 10; i++) {
      const w = 24 + rand() * 18, d = 24 + rand() * 14, h = 70 + rand() * 120;
      const x = 300 + rand() * 120, z = 560 + rand() * 120;
      const y = terrainHeight(x, z);
      const g = new THREE.BoxGeometry(w, h, d);
      // Window texture scaled to the face: one tile per ~16 m across, ~20 m up.
      const uv = g.getAttribute('uv');
      const nrm = g.getAttribute('normal');
      for (let k = 0; k < uv.count; k++) {
        const across = Math.abs(nrm.getX(k)) > 0.5 ? d : w;
        uv.setXY(k, uv.getX(k) * across / 16, uv.getY(k) * h / 20);
      }
      g.translate(x, y + h / 2, z);
      parts.push(g);
      tops.push(x, y + h + 1, z);
      topCols.push(1, 0.15, 0.1);
    }
    const geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    const mat = farFog(new THREE.MeshBasicMaterial({ map: tex }));
    this.timed.push({ mat, day: new THREE.Color(0.55, 0.6, 0.66), night: new THREE.Color(1, 1, 1), fadeIn: false });
    this.disposables.push(geo, mat);
    const towers = new THREE.Mesh(geo, mat);
    towers.matrixAutoUpdate = false;
    this.group.add(towers);
    this.addLights(tops, topCols, 3.2);
  }

  /** A cloud of point lights (fixed size on screen), fading in at night. */
  private addLights(pts: number[], cols: number[], size: number): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = farFog(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    this.disposables.push(geo, mat);
    this.timed.push({ mat, day: null, night: null, fadeIn: true });
    const pointsMesh = new THREE.Points(geo, mat);
    pointsMesh.matrixAutoUpdate = false;
    this.group.add(pointsMesh);
  }

  /** @param night 0 day .. 1 night: windows, pools, lamps and the far lights. */
  update(night: number): void {
    if (Math.abs(night - this.lastNight) < 0.01) return;
    this.lastNight = night;
    for (const t of this.timed) {
      if (t.fadeIn) t.mat.opacity = THREE.MathUtils.smoothstep(night, 0.3, 0.9) * (t.max ?? 1);
      if (t.day && t.night && t.mat.color) t.mat.color.copy(t.day).lerp(t.night, night);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const o of this.group.children) if (o instanceof THREE.InstancedMesh) o.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

/** A soft round spot, for lamp glows and pools of light. */
function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Office-tower glazing: rows of windows, some floors lit. */
function windowTexture(rand: Rand): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1017';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 16; row++) {
    const floorLit = rand() < 0.28;
    for (let col = 0; col < 16; col++) {
      const lit = floorLit ? rand() < 0.75 : rand() < 0.06;
      g.fillStyle = lit ? `rgba(255,${215 + rand() * 30},${160 + rand() * 60},1)` : '#141c27';
      g.fillRect(col * 8 + 1, row * 8 + 2, 6, 5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A fan palm's crown: a ring of fronds arching out and drooping, plus a few standing up (one geometry). */
function palmCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 14;
  for (let i = 0; i < fronds; i++) {
    const up = i % 3 === 0;
    // A frond: a strip that widens to a fan and bends down along its length.
    const g = new THREE.PlaneGeometry(1, 2.4, 1, 4);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + 1.2) / 2.4; // 0 at the trunk, 1 at the tip
      const width = 0.12 + 0.75 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.55);
      const droop = up ? -0.3 * t * t : -1.3 * t * t;
      p.setXYZ(k, p.getX(k) * width, t * (up ? 1.6 : 0.9) + droop, t * 2.4);
    }
    g.rotateY((i / fronds) * Math.PI * 2 + (up ? 0.3 : 0));
    g.rotateX(0);
    parts.push(g);
  }
  const out = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  return out;
}
