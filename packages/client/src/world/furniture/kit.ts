import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export interface PartOptions {
  /** Euler rotation in radians (XYZ order). */
  rot?: V3;
  scale?: V3;
  castShadow?: boolean;
}

/** Something that moves or changes after the map is built (water jets, flames). Kept out of geometry merging. */
export interface Dynamic {
  object: THREE.Object3D;
  update(dt: number, time: number): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A small modeling toolkit. All positions are part centres in the piece's local space
 * (floor at y = 0, front facing +z). Static parts are later merged by material.
 */
export class Kit {
  readonly group = new THREE.Group();
  readonly dynamics: Dynamic[] = [];
  readonly lights: THREE.Light[] = [];

  mesh(geo: THREE.BufferGeometry, x: number, y: number, z: number, mat: THREE.Material, o: PartOptions = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    m.castShadow = o.castShadow ?? true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, o?: PartOptions): THREE.Mesh {
    return this.mesh(cached(`b${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)), x, y, z, mat, o);
  }

  /** Box with rounded edges: cushions, mattresses, car bodies. */
  rbox(w: number, h: number, d: number, radius: number, x: number, y: number, z: number, mat: THREE.Material, o?: PartOptions): THREE.Mesh {
    const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.mesh(cached(`rb${r3(w)},${r3(h)},${r3(d)},${r3(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, r)), x, y, z, mat, o);
  }

  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, mat: THREE.Material,
    o: PartOptions & { seg?: number; open?: boolean } = {}): THREE.Mesh {
    const seg = o.seg ?? 16;
    return this.mesh(cached(`c${r3(rTop)},${r3(rBottom)},${r3(h)},${seg},${o.open ?? false}`,
      () => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, o.open ?? false)), x, y, z, mat, o);
  }

  sphere(r: number, x: number, y: number, z: number, mat: THREE.Material, o: PartOptions & { seg?: number } = {}): THREE.Mesh {
    const seg = o.seg ?? 16;
    return this.mesh(cached(`s${r3(r)},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)))), x, y, z, mat, o);
  }

  /** Surface of revolution from a [radius, height] profile (bottom to top): vases, columns, basins, lamp bases. */
  lathe(profile: [number, number][], x: number, y: number, z: number, mat: THREE.Material, o: PartOptions & { seg?: number } = {}): THREE.Mesh {
    const seg = o.seg ?? 28;
    const key = `l${seg}:${profile.map(([a, b]) => `${r3(a)},${r3(b)}`).join(';')}`;
    return this.mesh(cached(key, () => new THREE.LatheGeometry(profile.map(([a, b]) => new THREE.Vector2(Math.max(0.0001, a), b)), seg)),
      x, y, z, mat, o);
  }

  torus(radius: number, tube: number, x: number, y: number, z: number, mat: THREE.Material,
    o: PartOptions & { arc?: number; seg?: number } = {}): THREE.Mesh {
    const seg = o.seg ?? 24;
    const arc = o.arc ?? Math.PI * 2;
    return this.mesh(cached(`t${r3(radius)},${r3(tube)},${seg},${r3(arc)}`, () => new THREE.TorusGeometry(radius, tube, 8, seg, arc)),
      x, y, z, mat, o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, mat: THREE.Material, o: PartOptions & { seg?: number } = {}): THREE.Mesh {
    return this.cyl(0.0001, r, h, x, y, z, mat, o);
  }

  /** A cylinder between two points: rods, legs splayed at an angle, cables. */
  rod(r: number, a: V3, b: V3, mat: THREE.Material, seg = 8): THREE.Mesh {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = this.cyl(r, r, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, mat, { seg });
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    return m;
  }

  /** Four legs at the corners of a w×d footprint, inset by `inset`. */
  legs(w: number, d: number, h: number, inset: number, mat: THREE.Material, r = 0.025, round = true): void {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - inset);
      const z = sz * (d / 2 - inset);
      if (round) this.cyl(r, r * 0.8, h, x, h / 2, z, mat, { seg: 10 });
      else this.box(r * 2, h, r * 2, x, h / 2, z, mat);
    }
  }

  light(light: THREE.Light, x: number, y: number, z: number): void {
    light.position.set(x, y, z);
    this.group.add(light);
    this.lights.push(light);
  }

  dynamic(object: THREE.Object3D, update: (dt: number, time: number) => void): void {
    this.group.add(object);
    this.dynamics.push({ object, update });
  }
}
