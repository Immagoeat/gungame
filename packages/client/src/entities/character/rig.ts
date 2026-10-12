import * as THREE from 'three';

/**
 * Posing helpers for a Mixamo-style skeleton (Hips, Spine, Spine1, Spine2, Neck, Head, LeftArm,
 * LeftForeArm, LeftHand, LeftHandIndex1..., LeftUpLeg, LeftLeg, LeftFoot...). Any character
 * exported from Mixamo or rigged to its naming works. All the math is in world space so it doesn't
 * care how each bone's local axes happen to be set up.
 */

/** Skeleton nodes by name. End markers like HeadTop_End may be plain objects rather than bones. */
export type BoneMap = Map<string, THREE.Object3D>;

/** Bone names without the rig prefix ("mixamorig:Hips", "mixamorigHips" and "Hips" are all "Hips"). */
export function boneName(name: string): string {
  return name.replace(/^mixamorig\d*[:_]?/, '');
}

export function findBones(root: THREE.Object3D): BoneMap {
  const out: BoneMap = new Map();
  root.traverse(o => {
    const name = boneName(o.name);
    if (o instanceof THREE.Bone || !out.has(name)) out.set(name, o);
  });
  return out;
}

export function bone(bones: BoneMap, name: string): THREE.Object3D {
  const b = bones.get(name);
  if (!b) throw new Error(`Character rig has no ${name} bone`);
  return b;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Sets a bone's world rotation (keeps its children attached). */
export function setWorldQuaternion(b: THREE.Object3D, world: THREE.Quaternion): void {
  b.parent!.getWorldQuaternion(_q2);
  b.quaternion.copy(_q2.invert().multiply(world));
  b.updateMatrixWorld(true);
}

/** Rotates a bone about a world-space axis. */
export function rotateWorld(b: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  if (angle === 0) return;
  b.getWorldQuaternion(_q);
  setWorldQuaternion(b, new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(_q));
}

/** Rotates a bone so that a world direction it currently has turns into another. */
function swing(b: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  b.getWorldQuaternion(_q);
  setWorldQuaternion(b, new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()).multiply(_q));
}

export const worldPos = (o: THREE.Object3D, target = new THREE.Vector3()) => o.getWorldPosition(target);

/**
 * Two-bone IK: bends upper -> lower -> end (shoulder, elbow, wrist or hip, knee, ankle) so the end
 * reaches `target`, with the middle joint pushed towards `poleDir`. World space.
 * Returns how far short of the target the chain fell (0 when it reaches).
 */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, poleDir: THREE.Vector3): number {
  const a = worldPos(upper);
  const b = worldPos(lower);
  const c = worldPos(end);
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(c);
  const toTarget = target.clone().sub(a);
  const want = toTarget.length();
  const d = THREE.MathUtils.clamp(want, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
  const dir = toTarget.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let bend = poleDir.clone().addScaledVector(dir, -poleDir.dot(dir));
  if (bend.lengthSq() < 1e-8) bend = b.clone().sub(a).addScaledVector(dir, -b.clone().sub(a).dot(dir));
  bend.normalize();
  const elbow = a.clone().addScaledVector(dir, along).addScaledVector(bend, h);
  swing(upper, b.sub(a), elbow.clone().sub(a));
  const b2 = worldPos(lower);
  const c2 = worldPos(end, _v);
  swing(lower, c2.sub(b2), a.clone().addScaledVector(dir, d).sub(b2));
  return Math.max(0, want - d);
}

/**
 * Turns a hand so its knuckles point along `fingers` (wrist to knuckles) and the line from index to
 * little finger runs along `across`. World space.
 */
export function orientHand(bones: BoneMap, side: 'Left' | 'Right', fingers: THREE.Vector3, across: THREE.Vector3): void {
  const hand = bone(bones, `${side}Hand`);
  const f = bone(bones, `${side}HandMiddle1`).position.clone().normalize();
  const s = bone(bones, `${side}HandIndex1`).position.clone().sub(bone(bones, `${side}HandPinky1`).position).negate();
  s.addScaledVector(f, -s.dot(f)).normalize();
  const local = new THREE.Matrix4().makeBasis(f, s, new THREE.Vector3().crossVectors(f, s));
  const F = fingers.clone().normalize();
  const S = across.clone().addScaledVector(F, -across.dot(F)).normalize();
  const world = new THREE.Matrix4().makeBasis(F, S, new THREE.Vector3().crossVectors(F, S));
  const q = new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
  setWorldQuaternion(hand, q);
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'] as const;
export type Grip = Partial<Record<(typeof FINGERS)[number] | 'Thumb', number>>;

/**
 * Curls the fingers towards the palm (radians per joint, three joints per finger). Call after
 * orientHand. The thumb folds across the palm by its own amount.
 */
export function curlFingers(bones: BoneMap, side: 'Left' | 'Right', grip: Grip): void {
  const hand = bone(bones, `${side}Hand`);
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const f = bone(bones, `${side}HandMiddle1`).position.clone().normalize();
  const s = bone(bones, `${side}HandIndex1`).position.clone().sub(bone(bones, `${side}HandPinky1`).position).negate();
  s.addScaledVector(f, -s.dot(f)).normalize();
  // Curling turns each finger about the knuckle line, towards the palm.
  const axis = s.clone().applyQuaternion(handQ).multiplyScalar(side === 'Right' ? -1 : 1);
  for (const name of FINGERS) {
    const angle = grip[name] ?? 0;
    for (let i = 1; i <= 3; i++) rotateWorld(bone(bones, `${side}Hand${name}${i}`), axis, angle * (i === 1 ? 0.9 : 1.05));
  }
  if (grip.Thumb) {
    const palm = new THREE.Vector3().crossVectors(f, s).applyQuaternion(handQ).multiplyScalar(side === 'Right' ? 1 : -1);
    const fw = f.clone().applyQuaternion(handQ);
    const thumbAxis = new THREE.Vector3().crossVectors(palm, fw).normalize().multiplyScalar(side === 'Right' ? 1 : -1);
    rotateWorld(bone(bones, `${side}HandThumb1`), fw, grip.Thumb * 0.5 * (side === 'Right' ? -1 : 1));
    for (let i = 2; i <= 3; i++) rotateWorld(bone(bones, `${side}HandThumb${i}`), thumbAxis, grip.Thumb * 0.5);
  }
}

/** Where a hand's palm centre is (between the wrist and the middle knuckle). */
export function palmCenter(bones: BoneMap, side: 'Left' | 'Right'): THREE.Vector3 {
  return worldPos(bone(bones, `${side}Hand`)).lerp(worldPos(bone(bones, `${side}HandMiddle1`), _v2), 0.55);
}

/** Scales a character model (standing in its rest pose) to a height in meters. */
export function scaleToHeight(model: THREE.Object3D, bones: BoneMap, height: number): void {
  model.updateMatrixWorld(true);
  model.scale.multiplyScalar(height / worldPos(bone(bones, 'HeadTop_End')).y);
  model.updateMatrixWorld(true);
}

/** Where the eyes are in the head bone's space, measured in the rest pose (model facing -z). */
export function eyeInHead(bones: BoneMap): THREE.Vector3 {
  const head = bone(bones, 'Head');
  const top = worldPos(bone(bones, 'HeadTop_End'));
  const eye = worldPos(head).lerp(top, 0.4);
  eye.z -= top.distanceTo(worldPos(head)) * 0.4;
  return head.worldToLocal(eye);
}

/**
 * Adds a per-vertex attribute that is 1 on the arms from the hands up to `reach` meters from the
 * wrist (measured along the arm in the rest pose) and 0 elsewhere: what you see of yourself holding
 * a gun. Shared geometry: runs once per attribute name.
 */
export function addArmsAttribute(mesh: THREE.SkinnedMesh, attr: string, reach: number): void {
  const geo = mesh.geometry;
  if (geo.getAttribute(attr)) return;
  const bones = mesh.skeleton.bones;
  const out = new Float32Array(geo.getAttribute('position').count);
  const has = (name: string) => bones.some(b => boneName(b.name) === name);
  if (!['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'].every(has)) {
    // A part that isn't skinned to the arms (a helmet visor, say): none of it is hands.
    geo.setAttribute(attr, new THREE.BufferAttribute(out, 1));
    return;
  }
  // Rest-pose joint positions, in the same space as the bound vertices.
  const restPos = (i: number) => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert());
  const sides = (['Left', 'Right'] as const).map(side => {
    const hand = bones.findIndex(b => boneName(b.name) === `${side}Hand`);
    const elbow = bones.findIndex(b => boneName(b.name) === `${side}ForeArm`);
    const wrist = restPos(hand);
    return { side, wrist, towardElbow: restPos(elbow).sub(wrist).normalize() };
  });
  const armBone = bones.map(b => /^(Left|Right)(Arm|ForeArm|Hand.*)$/.test(boneName(b.name)));
  const idx = geo.getAttribute('skinIndex');
  const wt = geo.getAttribute('skinWeight');
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  for (let i = 0; i < idx.count; i++) {
    const bonesOf = [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)];
    const weights = [wt.getX(i), wt.getY(i), wt.getZ(i), wt.getW(i)];
    const onArm = bonesOf.reduce((w, b, k) => w + (armBone[b] ? weights[k] : 0), 0) > 0.5;
    if (!onArm) continue;
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
    // Nearest wrist decides the side.
    const s = sides[0].wrist.distanceToSquared(p) < sides[1].wrist.distanceToSquared(p) ? sides[0] : sides[1];
    out[i] = p.clone().sub(s.wrist).dot(s.towardElbow) < reach ? 1 : 0;
  }
  geo.setAttribute(attr, new THREE.BufferAttribute(out, 1));
}

/** A copy of a material that only draws the parts of the mesh where `attr` is above (or below) one half. */
export function regionMaterial(base: THREE.Material, attr: string, keep: 'above' | 'below'): THREE.Material {
  const m = base.clone();
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${attr};\nvarying float vRegion;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRegion = ${attr};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRegion;')
      .replace('void main() {', `void main() {\n  if (vRegion ${keep === 'above' ? '<' : '>'} 0.5) discard;`);
  };
  // Draw the inside too, so the cut edge looks like an open sleeve rather than a see-through hole.
  m.side = THREE.DoubleSide;
  m.customProgramCacheKey = () => `region:${attr}:${keep}`;
  return m;
}
