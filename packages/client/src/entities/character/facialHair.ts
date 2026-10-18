import * as THREE from 'three';
import { HEAD_R, shapeHead } from '../human';

/**
 * Facial hair grown off the face itself: a fine copy of the head's surface, pushed out along its
 * normals by a per-style density field (cheeks, jaw, moustache, chin, under the jaw). Where the
 * density fades out the shell sinks back under the skin, so edges taper instead of ending in a lip,
 * and the mouth is left clear. Coordinates are the head's: centred on the skull sphere, facing -z,
 * mouth at about y -0.05.
 */

export interface FacialHairStyle {
  /** 'stubble' is a skin-toned shadow; 'hair' uses the hair colour. */
  material: 'stubble' | 'hair';
  /** How far it stands off the skin at full density (m). */
  thickness: number;
  /** Uneven, clumpy surface: 0 smooth .. 1 rough. */
  clump: number;
  /** Extra length hanging below the chin (m). */
  drop: number;
  /** 0..1 at a point on the face (`p` sculpted, `n` the unsculpted direction from the centre). */
  density(p: THREE.Vector3, n: THREE.Vector3): number;
}

const smooth = THREE.MathUtils.smoothstep;
/** 1 below `at`, 0 above, over `soft` either side. */
const below = (v: number, at: number, soft: number) => 1 - smooth(v, at - soft, at + soft);
const above = (v: number, at: number, soft: number) => smooth(v, at - soft, at + soft);

/** Cheeks, jaw and under the chin, up to a cheek line that runs from the sideburns down to the mouth corners. */
function cheeks(p: THREE.Vector3, raise = 0): number {
  const ax = Math.abs(p.x);
  const top = -0.035 + 0.048 * smooth(ax, 0.024, 0.078) + raise;
  // Stops at the ears, but lower down it follows the jaw back to the neck.
  const back = -0.004 + 0.022 * smooth(-p.y, 0.05, 0.1);
  return below(p.y, top, 0.004) * below(p.z, back, 0.007);
}

/** The lips and a little margin around them stay clear. */
function mouthClear(p: THREE.Vector3): number {
  const e = (p.x / 0.022) ** 2 + ((p.y + 0.05) / 0.0092) ** 2;
  return smooth(e, 0.85, 1.3);
}

/** Over the upper lip, under the nose; the ends turn down past the mouth corners. */
function moustache(p: THREE.Vector3): number {
  const ax = Math.abs(p.x);
  const low = -0.042 - 0.011 * smooth(ax, 0.014, 0.028);
  const top = -0.035 - 0.004 * smooth(ax, 0.008, 0.026);
  return above(p.y, low, 0.002) * below(p.y, top, 0.002) * below(ax, 0.027, 0.003) * below(p.z, -0.06, 0.01);
}

/** Below the lower lip and down the chin, `w` wide. */
function chin(p: THREE.Vector3, w: number): number {
  return below(Math.abs(p.x), w, 0.005) * below(p.y, -0.06, 0.0025) * below(p.z, -0.025, 0.01);
}

export const FACIAL_HAIR: Record<string, FacialHairStyle | null> = {
  clean: null,
  stubble: {
    material: 'stubble', thickness: 0.0012, clump: 0, drop: 0,
    density: p => Math.max(cheeks(p, -0.004), moustache(p)) * mouthClear(p),
  },
  short: {
    material: 'hair', thickness: 0.0042, clump: 0.35, drop: 0.002,
    density: p => Math.max(cheeks(p), moustache(p)) * mouthClear(p),
  },
  beard: {
    material: 'hair', thickness: 0.008, clump: 0.6, drop: 0.016,
    density: p => Math.max(cheeks(p, 0.003), moustache(p)) * mouthClear(p),
  },
  goatee: {
    material: 'hair', thickness: 0.0038, clump: 0.4, drop: 0.006,
    density: p => Math.max(moustache(p), chin(p, 0.028)) * mouthClear(p),
  },
  moustache: {
    material: 'hair', thickness: 0.004, clump: 0.3, drop: 0,
    density: p => moustache(p) * mouthClear(p),
  },
  chinstrap: {
    material: 'hair', thickness: 0.0035, clump: 0.3, drop: 0.002,
    // Along the jawline only: under the jaw, and up the sides to the sideburns.
    density: (p, n) => cheeks(p) * Math.max(below(n.y, -0.6, 0.06), above(Math.abs(n.x), 0.8, 0.05)),
  },
};

/** A cheap smooth noise for clumps of hair. */
function clumps(p: THREE.Vector3): number {
  return (Math.sin(p.x * 410 + Math.sin(p.y * 260) * 2) * Math.sin(p.y * 380 + p.z * 150) +
    Math.sin(p.z * 520 + p.x * 200) * 0.5) / 1.5;
}

/** The style's shell in head coordinates, or null for clean-shaven. New geometry each call. */
export function facialHairGeometry(id: string, detail: 'high' | 'low' = 'high'): THREE.BufferGeometry | null {
  const style = FACIAL_HAIR[id];
  if (!style) return null;
  // The lower half of a finer sphere than the head's own, sculpted the same way.
  const [w, h] = detail === 'high' ? [128, 96] : [72, 54];
  const geo = new THREE.SphereGeometry(HEAD_R, w, Math.round(h * 0.6), 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6);
  const pos = geo.getAttribute('position');
  const count = pos.count;
  const dens = new Float32Array(count);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    n.fromBufferAttribute(pos, i).divideScalar(HEAD_R);
    p.copy(n).multiplyScalar(HEAD_R);
    shapeHead(p);
    dens[i] = style.density(p, n);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const normal = geo.getAttribute('normal');
  const nn = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const d = dens[i];
    p.fromBufferAttribute(pos, i);
    nn.fromBufferAttribute(normal, i);
    // Sink under the skin where there's no hair, so the edges taper.
    const rough = 1 + style.clump * 0.45 * clumps(p);
    const off = d > 0 ? style.thickness * Math.sqrt(d) * rough - 0.0012 * (1 - d) : -0.0012;
    p.addScaledVector(nn, off);
    // A full beard hangs: more length low on the chin.
    if (style.drop && d > 0) {
      const low = smooth(-p.y, 0.07, 0.115) * d * below(Math.abs(p.x), 0.06, 0.03);
      p.y -= style.drop * low * rough;
      p.z -= style.drop * 0.35 * low;
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  // Keep only triangles that touch some hair.
  const index = geo.getIndex()!;
  const kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (dens[a] > 0.02 || dens[b] > 0.02 || dens[c] > 0.02) kept.push(a, b, c);
  }
  geo.setIndex(kept);
  geo.computeVertexNormals();
  return geo;
}
