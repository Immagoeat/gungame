import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYER_EFFECTS } from '../../core/layers';
import { createBeam, createGlow } from '../beams';
import { canvasTexture } from '../textures';

/**
 * A black high-roof panel van (Sprinter style), real size. The body is lofted from cross-sections
 * along its length, so it has rounded edges, a sloping hood and windshield, cut wheel arches and
 * integrated glass; the sliding side door is cut out of the same surface and runs back on its track.
 * Working headlights (they cast light), brake lights, an interior light and rolling, steering wheels.
 *
 * Local space: ground at y = 0, the van's middle at z = 0, the front pointing down -z, the sliding
 * door on the right (+x).
 */
export interface Van {
  group: THREE.Group;
  /** Rolls the wheels by a distance travelled (meters) and turns the front ones (radians, + = left). */
  drive(distance: number, steer: number): void;
  /** 0 = shut, 1 = slid fully open. */
  setDoor(open: number): void;
  /** Headlights and running lights (0..1), and brake lights (0..1). */
  setLights(on: number, brake: number): void;
  /** Interior dome light (0..1), optionally in a colour (red for night driving). */
  setInterior(on: number, color?: number): void;
  readonly floorY: number;
  readonly doorway: THREE.Vector3;
  dispose(): void;
}

const NOSE = -2.98;
const TAIL = 2.95;
const WHEEL_R = 0.37;
const AXLE_FRONT = -1.78;
const AXLE_REAR = 1.92;
const ARCH_R = 0.47;
const FLOOR = 0.56;
const DOOR_Z0 = -0.64;
const DOOR_Z1 = 0.74;
const DOOR_TOP = 2.2;

type Pt = [number, number];

/** Smoothed piecewise lookup over (z, value) points. */
function curve(points: Pt[]): (z: number) => number {
  return z => {
    if (z <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (z <= points[i][0]) {
        const [z0, v0] = points[i - 1];
        const [z1, v1] = points[i];
        const t = (z - z0) / (z1 - z0);
        return v0 + (v1 - v0) * (t * t * (3 - 2 * t) * 0.35 + t * 0.65);
      }
    }
    return points[points.length - 1][1];
  };
}

/** Roofline: bumper, hood, steep windshield, flat high roof. */
const TOP = curve([[NOSE, 0.86], [-2.95, 0.98], [-2.86, 1.08], [-2.62, 1.17], [-2.25, 1.24], [-2.04, 1.3], [-1.42, 2.38], [-1.26, 2.49], [-1.05, 2.53], [2.86, 2.53], [TAIL, 2.47]]);
/** Half width: narrower nose rounding out to the body. */
const HALF = curve([[NOSE, 0.84], [-2.92, 0.93], [-2.75, 0.985], [-2.35, 1.0], [TAIL, 1.0]]);

function bottomAt(z: number): number {
  let b = 0.45;
  if (z < -2.4) b = THREE.MathUtils.lerp(0.3, 0.45, THREE.MathUtils.clamp((z - NOSE) / 0.55, 0, 1));
  if (z > 2.7) b = 0.42;
  for (const axle of [AXLE_FRONT, AXLE_REAR]) {
    const dz = z - axle;
    if (Math.abs(dz) < ARCH_R) b = Math.max(b, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - dz * dz) * 0.97);
  }
  return b;
}

type Seg = 'bottom' | 'side' | 'top' | 'corner';

/** Cross-section ring at one station: points around the body and the surface kind of each segment. */
function ring(z: number): { pts: Pt[]; seg: Seg[] } {
  const b = bottomAt(z);
  const t = TOP(z);
  const hw = HALF(z);
  const h = t - b;
  const rb = Math.min(0.1, h * 0.3);
  const rt = Math.min(z < -1.4 ? 0.12 : 0.2, h * 0.3);
  // Tumblehome: the upper body leans in a little above the belt line.
  const widthAt = (y: number) => hw * (1 - 0.06 * THREE.MathUtils.clamp((y - 1.25) / 1.25, 0, 1));
  const levels = [0.62, 0.95, 1.34, 2.1].map(y => THREE.MathUtils.clamp(y, b + rb, t - rt));
  const pts: Pt[] = [];
  const seg: Seg[] = [];
  const push = (x: number, y: number, s: Seg) => { pts.push([x, y]); seg.push(s); };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number, s: Seg) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s);
    }
  };
  for (const f of [0, 0.5]) push(widthAt(b) * f * 0.9, b, 'bottom');
  arc(widthAt(b) - rb, b + rb, rb, -Math.PI / 2, 0, 3, 'corner');
  for (const y of [b + rb, ...levels]) push(widthAt(y), y, 'side');
  arc(widthAt(t) - rt, t - rt, rt, 0, Math.PI / 2, 4, 'corner');
  for (const f of [0.6, 0.2, -0.2, -0.6]) push(widthAt(t) * f, t, 'top');
  arc(-widthAt(t) + rt, t - rt, rt, Math.PI / 2, Math.PI, 4, 'corner');
  for (const y of [...levels].reverse()) push(-widthAt(y), y, 'side');
  push(-widthAt(b), b + rb, 'side');
  arc(-widthAt(b) + rb, b + rb, rb, Math.PI, Math.PI * 1.5, 3, 'corner');
  push(-widthAt(b) * 0.45, b, 'bottom');
  return { pts, seg };
}

/** Station positions along the van, dense where the shape changes (nose, windshield, wheel arches). */
function stations(): number[] {
  const zs = new Set<number>();
  const add = (a: number, b: number, step: number) => { for (let z = a; z < b - 1e-6; z += step) zs.add(+z.toFixed(4)); };
  add(NOSE, -2.3, 0.04);
  add(-2.3, -1.2, 0.05);
  add(-1.2, TAIL, 0.12);
  for (const axle of [AXLE_FRONT, AXLE_REAR]) add(axle - ARCH_R - 0.02, axle + ARCH_R + 0.02, 0.035);
  for (const z of [DOOR_Z0, DOOR_Z1, -1.92, -0.78, 0.92, 2.62, TAIL]) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

type Region = 'paint' | 'glass' | 'plastic' | 'door' | 'doorGlass';

function region(x: number, y: number, z: number, s: Seg): Region {
  const side = s === 'side' || (s === 'corner' && y > 0.7 && y < 2.3);
  if (x > 0 && side && z > DOOR_Z0 && z < DOOR_Z1 && y > FLOOR - 0.12 && y < DOOR_TOP) {
    return y > 1.34 && y < 2.1 && z > DOOR_Z0 + 0.08 && z < DOOR_Z1 - 0.08 ? 'doorGlass' : 'door';
  }
  if (s === 'top' && z > -2.0 && z < -1.36) return 'glass'; // windshield
  if (side && y > 1.34 && y < 2.1) {
    if (z > -1.92 && z < -0.78 && y < 2.1 - Math.max(0, -1.62 - z) * 1.2) return 'glass'; // cab doors
    if (z > 0.92 && z < 2.62) return 'glass';
    if (x < 0 && z > DOOR_Z0 + 0.08 && z < DOOR_Z1 - 0.08) return 'glass';
  }
  if (y < 0.6 || (z < -2.62 && y < 0.88) || (z > 2.82 && y < 0.62)) return 'plastic';
  return 'paint';
}

function plateTexture(text: string): THREE.Texture {
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, s, s / 2);
    g.strokeStyle = '#1a2a6a';
    g.lineWidth = 6;
    g.strokeRect(4, 4, s - 8, s / 2 - 8);
    g.fillStyle = '#b3122a';
    g.font = 'italic bold 24px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('California', s / 2, 32);
    g.fillStyle = '#1a2a6a';
    g.font = 'bold 60px Arial, sans-serif';
    g.fillText(text, s / 2, 100);
  });
  t.repeat.set(1, 0.5);
  t.offset.set(0, 0.5);
  return t;
}

/**
 * Makes every triangle face away from the body's core (a line along the van at mid height), so no
 * face is culled from outside however the loft and caps happened to wind.
 */
function faceOutward(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const core = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const mid = a.clone().add(b).add(c).divideScalar(3);
    core.set(0, (bottomAt(mid.z) + TOP(mid.z)) / 2, THREE.MathUtils.clamp(mid.z, NOSE + 0.4, TAIL - 0.4));
    if (n.dot(mid.sub(core)) < 0) {
      // Swap two corners.
      pos.setXYZ(i + 1, c.x, c.y, c.z);
      pos.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  pos.needsUpdate = true;
}

/** Averages normals of coincident vertices within each material group (smooth body, crisp region edges). */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (const group of g.groups) {
    const sums = new Map<string, THREE.Vector3>();
    const end = group.start + group.count;
    for (let i = group.start; i < end; i++) {
      const k = key(i);
      const v = sums.get(k) ?? new THREE.Vector3();
      v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i);
      sums.set(k, v);
    }
    for (let i = group.start; i < end; i++) {
      const v = sums.get(key(i))!.clone().normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}

export function createVan(): Van {
  const group = new THREE.Group();
  group.name = 'van';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T) => (mats.push(m), m);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D = group, shadow = true) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, parent?: THREE.Object3D, r = 0) => {
    const m = add(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat, parent);
    m.position.set(x, y, z);
    return m;
  };

  // Deep black metallic paint with clear coat; dark privacy glass; textured black plastic; chrome.
  // Two-sided: the body is a single skin, and its inside shows from the cargo area.
  const paint = keep(new THREE.MeshPhysicalMaterial({ color: 0x050608, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.6, side: THREE.DoubleSide }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: 0x010203, metalness: 0.3, roughness: 0.02, clearcoat: 1, envMapIntensity: 0.9 }));
  const plastic = keep(new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.8, metalness: 0.05 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 1, roughness: 0.12, envMapIntensity: 0.8 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.9 }));
  const groove = keep(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  const alloy = keep(new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.85, roughness: 0.28, envMapIntensity: 0.6 }));
  const disc = keep(new THREE.MeshStandardMaterial({ color: 0x5b5d60, metalness: 0.9, roughness: 0.45 }));
  const lining = keep(new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.95, side: THREE.DoubleSide }));
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.92 }));
  const seat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.75 }));
  const housing = keep(new THREE.MeshPhysicalMaterial({ color: 0x0a0b0d, metalness: 0.6, roughness: 0.15, clearcoat: 1 }));
  const headLens = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3e2, emissiveIntensity: 4, roughness: 0.1 }));
  const drl = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe4eeff, emissiveIntensity: 5 }));
  const tail = keep(new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff1208, emissiveIntensity: 1.5, roughness: 0.2 }));
  const amber = keep(new THREE.MeshStandardMaterial({ color: 0x5a2c00, emissive: 0xff8a10, emissiveIntensity: 0.4 }));
  const domeMat = keep(new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xfff2d6, emissiveIntensity: 0 }));
  const stepMat = keep(new THREE.MeshStandardMaterial({ color: 0x232427, metalness: 0.6, roughness: 0.5 }));

  // ---- Lofted body shell, split by region; the door is its own panel.
  const zs = stations();
  const rings = zs.map(z => ring(z));
  const n = rings[0].pts.length;
  const positions: number[] = [];
  for (let i = 0; i < zs.length; i++) for (const [x, y] of rings[i].pts) positions.push(x, y, zs[i]);
  const buckets: Record<Region, number[]> = { paint: [], glass: [], plastic: [], door: [], doorGlass: [] };
  for (let i = 0; i < zs.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + ((j + 1) % n);
      const d = (i + 1) * n + j;
      const p0 = rings[i].pts[j];
      const p1 = rings[i].pts[(j + 1) % n];
      const r = region((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (zs[i] + zs[i + 1]) / 2, rings[i].seg[j]);
      buckets[r].push(a, d, b, b, d, c);
    }
  }
  // End caps: bumper face at the nose, rear doors at the tail.
  const capStart = positions.length / 3;
  for (const i of [0, zs.length - 1]) {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of rings[i].pts) { cx += x; cy += y; }
    positions.push(cx / n, cy / n, zs[i]);
  }
  const last = (zs.length - 1) * n;
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    buckets.plastic.push(capStart, k, j);
    buckets.paint.push(capStart + 1, last + j, last + k);
  }
  const shellGeo = (regions: Region[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const index: number[] = [];
    regions.forEach((r, m) => {
      g.addGroup(index.length, buckets[r].length, m);
      index.push(...buckets[r]);
    });
    g.setIndex(index);
    const out = g.toNonIndexed();
    faceOutward(out);
    out.computeVertexNormals();
    return smoothNormals(out);
  };
  add(shellGeo(['paint', 'glass', 'plastic']), [paint, glass, plastic]);

  const door = new THREE.Group();
  const doorGeo = shellGeo(['door', 'doorGlass']);
  doorGeo.translate(0.012, 0, 0);
  add(doorGeo, [paint, glass], door);
  box(0.03, 0.04, 0.2, HALF(0) + 0.03, 1.22, DOOR_Z0 + 0.18, plastic, door);
  group.add(door);

  // ---- Interior: lined walls and roof, floor, a bench seat, cab bulkhead, dome light.
  const iw = 1.86;
  box(iw, 0.04, TAIL - DOOR_Z0 + 0.6, 0, FLOOR - 0.02, (TAIL + DOOR_Z0 - 0.6) / 2, floorMat);
  const wallH = 2.4 - FLOOR - 0.1;
  box(0.02, wallH, TAIL - DOOR_Z0 + 0.5, -0.93, (2.4 + FLOOR) / 2, (TAIL + DOOR_Z0 - 0.5) / 2, lining);
  // Right wall: open where the sliding door is.
  for (const [z0, z1] of [[DOOR_Z0 - 0.5, DOOR_Z0], [DOOR_Z1, TAIL]]) box(0.02, wallH, z1 - z0, 0.93, (2.4 + FLOOR) / 2, (z0 + z1) / 2, lining);
  box(0.02, 2.4 - DOOR_TOP, DOOR_Z1 - DOOR_Z0, 0.93, (2.4 + DOOR_TOP) / 2, (DOOR_Z0 + DOOR_Z1) / 2, lining);
  box(iw, 0.02, TAIL - DOOR_Z0 + 0.5, 0, 2.4, (TAIL + DOOR_Z0 - 0.5) / 2, lining);
  box(iw, 2.4 - FLOOR, 0.04, 0, (2.4 + FLOOR) / 2, -1.15, lining);
  // Inside of the rear doors, open where their windows are.
  const back = TAIL - 0.06;
  box(iw, 1.55 - FLOOR, 0.03, 0, (1.55 + FLOOR) / 2, back, lining);
  box(iw, 2.4 - 2.17, 0.03, 0, (2.4 + 2.17) / 2, back, lining);
  box(0.1, 0.62, 0.03, 0, 1.86, back, lining);
  for (const sx of [-1, 1]) box(0.1, 0.62, 0.03, sx * 0.88, 1.86, back, lining);
  box(0.9, 0.36, 0.01, -0.3, 1.85, -1.125, glass);
  box(1.5, 0.12, 0.55, -0.2, FLOOR + 0.42, 1.6, seat, group, 0.04);
  box(1.5, 0.62, 0.12, -0.2, FLOOR + 0.8, 1.9, seat, group, 0.04);
  for (const sx of [-0.8, 0.4]) box(0.06, 0.4, 0.4, sx, FLOOR + 0.2, 1.6, plastic);
  box(0.3, 0.03, 0.12, 0, 2.38, 0.1, domeMat).castShadow = false;
  const domeLight = new THREE.PointLight(0xfff0d0, 0, 5, 1.4);
  domeLight.position.set(0, 2.2, 0.2);
  group.add(domeLight);

  // ---- Nose: grille with chrome surround and slats, swept headlights, bumper, fog lights.
  box(0.98, 0.42, 0.05, 0, 0.88, -2.965, plastic, group, 0.02);
  box(1.04, 0.05, 0.06, 0, 1.1, -2.96, chrome, group, 0.02);
  box(1.04, 0.05, 0.06, 0, 0.66, -2.96, chrome, group, 0.02);
  for (let i = 0; i < 3; i++) box(0.94, 0.035, 0.03, 0, 0.77 + i * 0.11, -2.98, chrome);
  box(0.13, 0.13, 0.025, 0, 0.88, -2.995, chrome, group, 0.03);
  const lamps: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    const unit = new THREE.Group();
    unit.position.set(sx * 0.7, 1.02, -2.9);
    unit.rotation.y = -sx * 0.35;
    box(0.42, 0.16, 0.12, 0, 0, 0, housing, unit, 0.04);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16).rotateX(Math.PI / 2), headLens, unit, false).position.set(sx * 0.07, 0.01, -0.06);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16).rotateX(Math.PI / 2), headLens, unit, false).position.set(-sx * 0.08, 0.01, -0.06);
    box(0.36, 0.018, 0.02, 0, -0.06, -0.06, drl, unit);
    group.add(unit);
    lamps.push(new THREE.Vector3(sx * 0.7, 1.02, -3.0));
    box(0.12, 0.05, 0.03, sx * 0.72, 0.5, -2.975, amber, group, 0.015);
    // Mirrors on stalks.
    box(0.18, 0.04, 0.04, sx * 1.08, 1.6, -1.6, plastic);
    box(0.1, 0.32, 0.22, sx * 1.2, 1.72, -1.6, paint, group, 0.04);
    box(0.012, 0.28, 0.19, sx * 1.255, 1.72, -1.6, chrome);
    box(0.02, 0.03, 0.12, sx * 1.255, 1.6, -1.6, amber);
    box(0.03, 0.035, 0.18, sx * 1.01, 1.18, -1.05, plastic);
    // Tall taillights, rear windows and handles on the barn doors.
    box(0.1, 0.72, 0.06, sx * 0.94, 1.12, TAIL + 0.02, tail, group, 0.02);
    box(0.08, 0.1, 0.05, sx * 0.94, 0.62, TAIL + 0.02, amber, group, 0.01);
    box(0.78, 0.6, 0.01, sx * 0.44, 1.86, TAIL + 0.006, glass);
    box(0.03, 0.04, 0.2, sx * 0.08, 1.25, TAIL + 0.03, plastic);
  }
  box(0.36, 0.04, 0.03, 0, 2.47, TAIL + 0.01, tail);
  box(0.006, 1.9, 0.02, 0, 1.45, TAIL + 0.012, plastic);
  // Bumpers, rub strips, rear step.
  box(2.0, 0.26, 0.24, 0, 0.44, -2.9, plastic, group, 0.08);
  box(2.0, 0.22, 0.24, 0, 0.46, TAIL + 0.08, plastic, group, 0.06);
  box(0.9, 0.05, 0.3, 0, 0.36, TAIL + 0.18, stepMat);
  const strip = [AXLE_FRONT + ARCH_R + 0.06, AXLE_REAR - ARCH_R - 0.06];
  for (const sx of [-1, 1]) box(0.03, 0.08, strip[1] - strip[0], sx * 1.005, 0.58, (strip[0] + strip[1]) / 2, plastic);
  // Wipers, roof rails, antenna.
  for (const sx of [-1, 1]) box(0.7, 0.018, 0.02, sx * 0.35, 1.33, -2.0, plastic).rotation.z = sx * 0.12;
  for (const sx of [-1, 1]) box(0.04, 0.04, 3.6, sx * 0.8, 2.56, 0.9, plastic);
  box(0.01, 0.35, 0.01, 0.5, 2.7, -0.9, plastic);
  for (const [z, y, flip] of [[-3.01, 0.5, true], [TAIL + 0.205, 0.62, false]] as [number, number, boolean][]) {
    const plate = keep(new THREE.MeshStandardMaterial({ map: plateTexture('8GNG247'), roughness: 0.5, metalness: 0.2 }));
    const g = new THREE.PlaneGeometry(0.52, 0.12);
    if (flip) g.rotateY(Math.PI);
    add(g, plate, group, false).position.set(0, y, z);
  }

  // ---- Wheels: rounded tyre with tread grooves, ten-spoke alloy, centre cap, lug nuts, brake disc.
  const spinners: THREE.Group[] = [];
  const steerers: THREE.Group[] = [];
  const profile = ([[0.24, -0.115], [0.3, -0.12], [0.35, -0.11], [0.368, -0.085], [0.372, -0.05], [0.372, 0.05], [0.368, 0.085], [0.35, 0.11], [0.3, 0.12], [0.24, 0.115]] as Pt[])
    .map(([r, y]) => new THREE.Vector2(r, y));
  const tyreGeo = new THREE.LatheGeometry(profile, 36).rotateZ(Math.PI / 2);
  const grooveGeo = new THREE.TorusGeometry(0.371, 0.006, 4, 36).rotateY(Math.PI / 2);
  for (const [z, steer] of [[AXLE_FRONT, true], [AXLE_REAR, false]] as [number, boolean][]) {
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.86, WHEEL_R, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      add(tyreGeo, rubber, spin);
      for (const ox of [-0.06, -0.02, 0.02, 0.06]) add(grooveGeo, groove, spin).position.x = ox;
      add(new THREE.CylinderGeometry(0.245, 0.245, 0.2, 28).rotateZ(Math.PI / 2), alloy, spin);
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24).rotateZ(Math.PI / 2), disc, spin).position.x = -sx * 0.02;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const spoke = add(new THREE.BoxGeometry(0.03, 0.17, 0.035), alloy, spin);
        spoke.position.set(sx * 0.105, Math.cos(a) * 0.13, Math.sin(a) * 0.13);
        spoke.rotation.x = -a;
      }
      add(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 18).rotateZ(Math.PI / 2), chrome, spin).position.x = sx * 0.11;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 8).rotateZ(Math.PI / 2), chrome, spin).position.set(sx * 0.11, Math.cos(a) * 0.08, Math.sin(a) * 0.08);
      }
      group.add(pivot);
      spinners.push(spin);
      if (steer) steerers.push(pivot);
    }
  }

  // ---- Lights: two headlight spots (one casts shadows), faint beams in the night air, lens and tail glows.
  const spots: THREE.SpotLight[] = [];
  const beams: ReturnType<typeof createBeam>[] = [];
  const glows: THREE.Sprite[] = [];
  lamps.forEach((pos, i) => {
    const s = new THREE.SpotLight(0xfff4e4, 0, 45, 0.42, 0.55, 1.2);
    s.position.copy(pos);
    s.target.position.copy(pos).add(new THREE.Vector3(0, -0.9, -14));
    if (i === 0) {
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0015;
    }
    group.add(s, s.target);
    spots.push(s);
    const beam = createBeam(0xfff2dd, 16, 2.6, 0.08, 0, 1.5);
    beam.mesh.position.copy(pos);
    beam.aim(new THREE.Vector3(0, -0.07, -1));
    group.add(beam.mesh);
    beams.push(beam);
    const glow = createGlow(0xfff2dd, 0.9, 1);
    glow.position.copy(pos).add(new THREE.Vector3(0, 0, -0.05));
    group.add(glow);
    glows.push(glow);
  });
  const tailGlows = [-1, 1].map(sx => {
    const g = createGlow(0xff2010, 0.55, 0.8);
    g.position.set(sx * 0.94, 1.12, TAIL + 0.1);
    group.add(g);
    return g;
  });
  group.traverse(o => { if (o instanceof THREE.Sprite) o.layers.set(LAYER_EFFECTS); });

  const doorLen = DOOR_Z1 - DOOR_Z0;
  const api: Van = {
    group,
    floorY: FLOOR,
    doorway: new THREE.Vector3(1.0, FLOOR, (DOOR_Z0 + DOOR_Z1) / 2),
    drive(distance, steer) {
      for (const s of spinners) s.rotation.x = -distance / WHEEL_R;
      for (const p of steerers) p.rotation.y = steer;
    },
    setDoor(open) {
      const out = THREE.MathUtils.smoothstep(open, 0, 0.25) * 0.075;
      const back = THREE.MathUtils.smoothstep(open, 0.2, 1) * (doorLen + 0.04);
      door.position.set(out, 0, back);
    },
    setLights(on, brake) {
      for (const s of spots) { s.intensity = 60 * on; s.visible = on > 0.01; }
      for (const b of beams) b.setStrength(0.1 * on);
      for (const g of glows) g.visible = on > 0.01;
      headLens.emissiveIntensity = 0.2 + 4 * on;
      drl.emissiveIntensity = 0.2 + 5 * on;
      const level = 0.15 + 0.45 * on + 1.2 * brake;
      tail.emissiveIntensity = level * 2;
      for (const g of tailGlows) { g.visible = level > 0.3; g.material.opacity = Math.min(1, level); }
    },
    setInterior(on, color = 0xfff0d0) {
      domeLight.color.setHex(color);
      domeMat.emissive.setHex(color);
      domeLight.intensity = 6 * on;
      domeLight.visible = on > 0.01;
      domeMat.emissiveIntensity = 2 * on;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const b of beams) b.material.dispose();
      group.removeFromParent();
    },
  };
  api.setLights(0, 0);
  api.setInterior(0);
  return api;
}
