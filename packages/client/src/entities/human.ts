import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint } from '../world/furniture/paint';
import { normalMapFrom } from '../world/normalMaps';
import { canvasTexture } from '../world/textures';

/** Materials for a human: skin, hair, eyes, clothing. Shared by the player body and the first-person arms. */
export interface HumanMaterials {
  skin: THREE.MeshStandardMaterial;
  lips: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  brow: THREE.MeshStandardMaterial;
  eyeWhite: THREE.MeshStandardMaterial;
  iris: THREE.MeshStandardMaterial;
  pupil: THREE.MeshStandardMaterial;
  jacket: THREE.MeshStandardMaterial;
  jacketDark: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

let shared: HumanMaterials | null = null;

export function humanMaterials(): HumanMaterials {
  if (shared) return shared;
  const skinTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(120,60,40,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
  });
  const hairTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.2})`;
      g.lineWidth = 1;
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 6, y + 6 + Math.random() * 8);
      g.stroke();
    }
  });
  const fabricTex = canvasTexture(64, paint.weave);
  fabricTex.repeat.set(6, 6);
  const fabricNormal = normalMapFrom(fabricTex, 1.5);
  const cloth = (color: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, map: fabricTex, normalMap: fabricNormal, roughness });
  shared = {
    skin: new THREE.MeshStandardMaterial({ color: 0xc08a68, map: skinTex, normalMap: normalMapFrom(skinTex, 0.6), roughness: 0.6 }),
    lips: new THREE.MeshStandardMaterial({ color: 0xa8645a, roughness: 0.45 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2b1d14, map: hairTex, normalMap: normalMapFrom(hairTex, 2), roughness: 0.75 }),
    brow: new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.9 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2eeea, roughness: 0.15 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x4a6b3a, roughness: 0.2 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 }),
    jacket: cloth(0x2e3a2c),
    jacketDark: cloth(0x232b22),
    shirt: cloth(0x1f2124),
    pants: cloth(0x4a4636),
    belt: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.5 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 }),
  };
  return shared;
}

const rbox = (w: number, h: number, d: number, r: number) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005));

/** Adds a mesh to a parent and returns it. */
export type AddPart = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  x: number, y: number, z: number, rot?: [number, number, number], scale?: [number, number, number]) => THREE.Mesh;

/** Radius of the sphere the head is sculpted from. */
export const HEAD_R = 0.1;

/**
 * Sculpts a point on the head's base sphere (radius HEAD_R, centred on the head) into the face's shape.
 * Facial hair grows off the same surface, so it's shared.
 */
export function shapeHead(v: THREE.Vector3): THREE.Vector3 {
  const R = HEAD_R;
  const ny = v.y / R;
  const front = v.z < 0 ? -v.z / R : 0;
  v.y *= 1.17;
  // Narrow the jaw and chin, square off the chin a touch, push the face forward.
  if (ny < 0) {
    const t = -ny;
    v.x *= 1 - 0.22 * t * t;
    v.z *= 1 - 0.1 * t;
    if (front > 0.4 && ny < -0.55) v.z -= 0.012 * (t - 0.55) * front * 4;
  }
  // Cheekbones and brow ridge, blended in smoothly (hard steps show as ledges).
  const bump = (x: number, a: number, b: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return Math.sin(t * Math.PI) ** 2;
  };
  v.x *= 1 + 0.04 * bump(ny, -0.3, 0.1) * THREE.MathUtils.smoothstep(front, 0.35, 0.65);
  v.z -= 0.006 * bump(ny, 0.12, 0.48) * THREE.MathUtils.smoothstep(front, 0.55, 0.85);
  // Slightly flatter sides and back.
  v.x *= 0.88;
  if (v.z > 0) v.z *= 0.95;
  // Eye sockets, so the eyes sit in the face rather than under it.
  if (v.z < -0.05) {
    for (const s of [-1, 1]) {
      const e = ((v.x - s * 0.031) / 0.02) ** 2 + ((v.y - 0.014) / 0.0125) ** 2;
      if (e < 1) v.z += 0.0165 * (1 - e) ** 1.6;
    }
  }
  return v;
}

/** Sculpted head facing -z: jaw, chin, cheekbones, eyes, brows, nose, lips, ears and hair. Origin at the base of the skull. */
/** Segments around and down the head: fine for close-ups, coarser for crowds. */
export const HEAD_DETAIL = { high: [72, 54], low: [48, 36] } as const;

export function buildHead(parent: THREE.Object3D, add: AddPart, m: HumanMaterials, detail: keyof typeof HEAD_DETAIL = 'high'): void {
  const R = HEAD_R;
  const geo = new THREE.SphereGeometry(R, ...HEAD_DETAIL[detail]);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    shapeHead(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  add(parent, geo, m.skin, 0, 0.11, 0);

  // Eyes (whites, irises, pupils), lids and brows.
  for (const s of [-1, 1]) {
    const ex = s * 0.031;
    // Eyeball set back into the socket so only an almond of it shows, iris and pupil on its surface.
    add(parent, new THREE.SphereGeometry(0.0115, 16, 12), m.eyeWhite, ex, 0.124, -0.077, undefined, [1, 0.62, 0.9]);
    add(parent, new THREE.CylinderGeometry(0.0058, 0.0058, 0.0016, 18), m.iris, ex, 0.124, -0.0873, [Math.PI / 2, 0, 0]);
    add(parent, new THREE.CylinderGeometry(0.0026, 0.0026, 0.0018, 12), m.pupil, ex, 0.124, -0.0879, [Math.PI / 2, 0, 0]);
    // Upper lid and a soft crease above it.
    add(parent, new THREE.TorusGeometry(0.0115, 0.0022, 6, 16, Math.PI), m.skin, ex, 0.1245, -0.0855, [0, 0, 0], [1, 0.75, 1]);
    add(parent, new THREE.TorusGeometry(0.011, 0.0015, 6, 16, Math.PI), m.skin, ex, 0.1235, -0.0858, [0, 0, Math.PI], [1, 0.45, 1]);
    add(parent, rbox(0.032, 0.006, 0.01, 0.003), m.brow, ex, 0.139, -0.09, [0.15, 0, s * -0.1]);
    add(parent, new THREE.SphereGeometry(0.027, 14, 10), m.skin, s * 0.088, 0.11, 0.004, undefined, [0.3, 1, 0.65]);
    add(parent, new THREE.TorusGeometry(0.016, 0.003, 6, 14, Math.PI * 1.3), m.skin, s * 0.092, 0.112, 0.004, [0, s * Math.PI / 2, 0.6]);
  }
  // Nose: bridge, tip, nostrils.
  add(parent, rbox(0.016, 0.042, 0.018, 0.007), m.skin, 0, 0.108, -0.094, [0.32, 0, 0]);
  add(parent, new THREE.SphereGeometry(0.0115, 14, 10), m.skin, 0, 0.088, -0.103);
  for (const s of [-1, 1]) add(parent, new THREE.SphereGeometry(0.0075, 10, 8), m.skin, s * 0.009, 0.085, -0.098);
  // Mouth.
  add(parent, rbox(0.036, 0.008, 0.012, 0.004), m.lips, 0, 0.064, -0.092);
  add(parent, rbox(0.032, 0.009, 0.012, 0.0045), m.lips, 0, 0.056, -0.09);
  // Hair: short and textured, hairline high at the temples, fuller on top, tapered at the back.
  const hair = new THREE.SphereGeometry(R * 1.045, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hp = hair.getAttribute('position');
  for (let i = 0; i < hp.count; i++) {
    v.fromBufferAttribute(hp, i);
    const front = v.z < 0 ? -v.z / R : 0;
    // Recede the hairline at the front corners and add an uneven fringe.
    if (front > 0.35 && v.y < R * 0.55) v.y = Math.max(v.y, R * (0.45 + 0.25 * Math.abs(v.x / R)) + Math.sin(v.x * 300) * 0.002);
    v.y += Math.max(0, v.y) * 0.08;
    hp.setXYZ(i, v.x * 0.9, v.y, v.z * (v.z > 0 ? 0.98 : 1));
  }
  hair.computeVertexNormals();
  add(parent, hair, m.hair, 0, 0.11, 0.004, [0.12, 0, 0], [1, 1.17, 1]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add(parent, new THREE.SphereGeometry(0.026, 10, 8), m.hair, Math.cos(a) * 0.045, 0.215 + Math.sin(i * 1.7) * 0.004, Math.sin(a) * 0.045, [0.3, a, 0], [1, 0.45, 1]);
  }
  for (const s of [-1, 1]) add(parent, rbox(0.007, 0.03, 0.016, 0.0035), m.hair, s * 0.086, 0.122, -0.032);
}

/** Joints of a hand, so fingers can be posed. */
export interface Hand {
  root: THREE.Group;
  /** Proximal, middle, distal joints for index..pinky, then the thumb. */
  fingers: THREE.Group[][];
  thumb: THREE.Group[];
}

/**
 * A hand with jointed fingers. Local frame: wrist at the origin, the hand extends along -y,
 * the palm faces -z. `side` mirrors the thumb. `curl` (0..1) closes the fingers; `trigger`
 * leaves the index finger straighter.
 */
export function buildHand(add: AddPart, m: THREE.Material, side: 'left' | 'right', curl: number, trigger = false): Hand {
  const root = new THREE.Group();
  const thumbSide = side === 'right' ? 1 : -1;
  // Palm: rounded and slightly cupped, wider at the knuckles than the wrist.
  add(root, new THREE.SphereGeometry(0.05, 20, 14), m, 0, -0.048, 0.002, undefined, [0.8, 0.95, 0.32]);
  add(root, new THREE.CylinderGeometry(0.024, 0.028, 0.04, 16), m, 0, 0.008, 0.002, undefined, [1.25, 1, 0.72]);
  for (let f = 0; f < 4; f++) add(root, new THREE.SphereGeometry(0.0105, 10, 8), m, thumbSide * (0.028 - f * 0.019), -0.088, 0.001);
  const widths = [0.0185, 0.019, 0.0182, 0.016];
  const lengths = [[0.045, 0.027, 0.022], [0.049, 0.03, 0.023], [0.046, 0.028, 0.022], [0.037, 0.022, 0.019]];
  const fingers: THREE.Group[][] = [];
  for (let f = 0; f < 4; f++) {
    const x = thumbSide * (0.028 - f * 0.019);
    let parent: THREE.Object3D = root;
    let y = -0.088;
    const joints: THREE.Group[] = [];
    const c = trigger && f === 0 ? curl * 0.35 : curl;
    for (let s = 0; s < 3; s++) {
      const j = new THREE.Group();
      j.position.set(s === 0 ? x : 0, y, 0);
      j.rotation.x = c * [1.25, 1.45, 1.0][s];
      parent.add(j);
      const len = lengths[f][s];
      const rad = (widths[f] / 2) * (1 - s * 0.1);
      add(j, new THREE.CapsuleGeometry(rad, Math.max(0.002, len - rad * 1.2), 4, 10), m, 0, -len / 2, 0, undefined, [1, 1, 0.9]);
      joints.push(j);
      parent = j;
      y = -len;
    }
    fingers.push(joints);
  }
  // Thumb: angled out from the base of the palm, curling across.
  const t0 = new THREE.Group();
  t0.position.set(thumbSide * 0.036, -0.02, -0.008);
  t0.rotation.set(curl * 0.7, 0, thumbSide * (0.7 + curl * 0.25));
  root.add(t0);
  add(t0, new THREE.CapsuleGeometry(0.0115, 0.026, 4, 10), m, 0, -0.02, 0);
  const t1 = new THREE.Group();
  t1.position.set(0, -0.04, 0);
  t1.rotation.x = curl * 0.6;
  t0.add(t1);
  add(t1, new THREE.CapsuleGeometry(0.0105, 0.018, 4, 10), m, 0, -0.015, 0);
  return { root, fingers, thumb: [t0, t1] };
}

/** Orients a hand group from where its fingers should point and which way its palm faces (world or parent space). */
export function orientHand(hand: THREE.Object3D, fingerDir: THREE.Vector3, palmDir: THREE.Vector3): void {
  const y = fingerDir.clone().normalize().negate();
  const z = palmDir.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
