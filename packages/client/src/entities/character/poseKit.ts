import * as THREE from 'three';
import { bone, orientHand, rotateWorld, setWorldQuaternion, solveTwoBone, worldPos, type BoneMap } from './rig';

/**
 * Procedural poses layered over a character's animation clip, shared by the player and the party
 * guests: sitting, lowering the hips with the feet planted, reaching a hand somewhere, looking at
 * something. All in world space on Mixamo bone names (see rig.ts).
 */

/** Where a character stands and which way it faces, in world space. */
export interface BodyFrame {
  origin: THREE.Vector3;
  quaternion: THREE.Quaternion;
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
}

export function bodyFrame(group: THREE.Object3D): BodyFrame {
  const quaternion = group.getWorldQuaternion(new THREE.Quaternion());
  return {
    origin: group.getWorldPosition(new THREE.Vector3()),
    quaternion,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion),
  };
}

/** Rest-pose foot orientations relative to the body, so feet can be put down flat in any pose. */
export type FootRest = Record<'Left' | 'Right', THREE.Quaternion>;

export function captureFootRest(bones: BoneMap, group: THREE.Object3D): FootRest {
  group.updateMatrixWorld(true);
  const inv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const rel = (side: 'Left' | 'Right') => inv.clone().multiply(bone(bones, `${side}Foot`).getWorldQuaternion(new THREE.Quaternion()));
  return { Left: rel('Left'), Right: rel('Right') };
}

const b = (bones: BoneMap, n: string) => bone(bones, n);

/** Moves the hips bone to a world position, keeping its rotation. */
function placeHips(bones: BoneMap, target: THREE.Vector3): void {
  const hips = b(bones, 'Hips');
  hips.position.copy(hips.parent!.worldToLocal(target.clone()));
  hips.updateMatrixWorld(true);
}

/**
 * Lowers the hips by `drop` meters and bends the legs so the feet stay where the clip put them.
 * `narrow` (0..1) brings a wide stance in under the body and turns the feet to point forward
 * (the soldier's idle clip stands like a soldier; a party guest shouldn't).
 */
export function dropHips(
  bones: BoneMap, frame: BodyFrame, drop: number, narrow = 0, rest?: FootRest,
  step?: Partial<Record<'Left' | 'Right', THREE.Vector3>>,
): void {
  // Feet are placed relative to where the body stands (not the hips), so swaying hips don't drag them.
  const hipsAt = frame.origin;
  const feet = (['Left', 'Right'] as const).map(side => {
    const pos = worldPos(b(bones, `${side}Foot`));
    const q = b(bones, `${side}Foot`).getWorldQuaternion(new THREE.Quaternion());
    if (narrow > 0) {
      const sx = side === 'Left' ? -1 : 1;
      const lateral = pos.clone().sub(hipsAt).dot(frame.right);
      pos.addScaledVector(frame.right, (sx * 0.11 - lateral) * narrow);
      const fwd = pos.clone().sub(hipsAt).dot(frame.forward);
      pos.addScaledVector(frame.forward, (0.02 - fwd) * narrow * 0.6);
      if (rest) q.slerp(frame.quaternion.clone().multiply(rest[side]), narrow);
    }
    // Stepping: lift or move a foot (world-space offset).
    const off = step?.[side];
    if (off) pos.add(off);
    return { side, pos, q };
  });
  placeHips(bones, worldPos(b(bones, 'Hips')).add(new THREE.Vector3(0, -drop, 0)));
  const knee = frame.forward.clone().add(new THREE.Vector3(0, 0.2, 0));
  for (const f of feet) {
    solveTwoBone(b(bones, `${f.side}UpLeg`), b(bones, `${f.side}Leg`), b(bones, `${f.side}Foot`), f.pos, knee);
    setWorldQuaternion(b(bones, `${f.side}Foot`), f.q);
  }
}

export interface SitOptions {
  /** World height of the seat surface. */
  seat: number;
  /** World height of the floor under the feet. */
  floor: number;
  /** Forward lean of the upper body, radians (elbows-on-knees is about 0.45). */
  lean?: number;
  /** How far forward of the hips the feet rest, meters. */
  reach?: number;
  /** Knees apart, meters (each side). */
  spread?: number;
  /** 0 = standing (as animated), 1 = fully seated; in between rises or sits down naturally. */
  blend?: number;
}

/**
 * Sits the character on a seat: pelvis on the surface slightly behind the body origin, thighs forward,
 * shins down to feet flat on the floor, upper body leaning as asked. While `blend` is between 0 and 1
 * it rises through a natural path: lean forward over the feet first, then push up.
 */
export function sit(bones: BoneMap, frame: BodyFrame, feet: FootRest, o: SitOptions): void {
  const k = THREE.MathUtils.clamp(o.blend ?? 1, 0, 1);
  if (k <= 0) return;
  const reach = o.reach ?? 0.44;
  const spread = o.spread ?? 0.06;
  // Where the feet go when seated (flat, in front of the seat).
  const hipsNow = worldPos(b(bones, 'Hips'));
  const seated = frame.origin.clone().addScaledVector(frame.forward, -0.06);
  seated.y = o.seat + 0.1;
  // Rising: the hips travel up and forward over the feet before straightening.
  const rise = 1 - k;
  const path = seated.clone().lerp(hipsNow, ease(rise)).addScaledVector(frame.forward, Math.sin(rise * Math.PI) * 0.16);
  placeHips(bones, path);
  // Lean forward to stand up (weight over the feet), then the seated lean.
  const lean = THREE.MathUtils.lerp(0, o.lean ?? 0.12, k) + Math.sin(rise * Math.PI) * 0.45;
  rotateWorld(b(bones, 'Spine'), frame.right, -lean * 0.6);
  rotateWorld(b(bones, 'Spine1'), frame.right, -lean * 0.4);
  // Keep the gaze level when leaning forward, as people do (head pitch is added on top).
  rotateWorld(b(bones, 'Neck'), frame.right, lean * 0.75);
  // Legs: feet planted in front of the seat, knees forward and slightly apart.
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? -1 : 1;
    const hip = worldPos(b(bones, `${side}UpLeg`));
    const seatedFoot = hip.clone().addScaledVector(frame.forward, reach).addScaledVector(frame.right, sx * spread);
    seatedFoot.y = o.floor + 0.09;
    const animFoot = worldPos(b(bones, `${side}Foot`));
    const foot = animFoot.lerp(seatedFoot, Math.min(1, k * 1.6));
    const pole = frame.forward.clone().add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(frame.right, sx * 0.25);
    solveTwoBone(b(bones, `${side}UpLeg`), b(bones, `${side}Leg`), b(bones, `${side}Foot`), foot, pole);
    setWorldQuaternion(b(bones, `${side}Foot`), frame.quaternion.clone().multiply(feet[side]));
  }
}

/** Turns the neck and head towards a world point, sharing the turn between them. */
export function lookAt(bones: BoneMap, frame: BodyFrame, target: THREE.Vector3, weight = 1): void {
  const head = b(bones, 'Head');
  const eye = worldPos(head).add(new THREE.Vector3(0, 0.08, 0));
  const to = target.clone().sub(eye);
  // Yaw relative to the body, and pitch, both limited to what a neck can do.
  const localDir = to.clone().applyQuaternion(frame.quaternion.clone().invert()).normalize();
  const yaw = THREE.MathUtils.clamp(Math.atan2(-localDir.x, -localDir.z), -1.1, 1.1) * weight;
  const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(localDir.y, -1, 1)), -0.6, 0.5) * weight;
  for (const [n, share] of [['Neck', 0.45], ['Head', 0.55]] as const) {
    rotateWorld(b(bones, n), frame.up, yaw * share);
    rotateWorld(b(bones, n), frame.right, pitch * share);
  }
}

/**
 * Puts a hand somewhere (wrist at `wrist`), elbow towards `pole`, fingers along `fingers` and the
 * palm side facing `across`'s normal. Returns how far short it fell.
 */
export function placeHand(
  bones: BoneMap, side: 'Left' | 'Right', wrist: THREE.Vector3, pole: THREE.Vector3, fingers: THREE.Vector3, across: THREE.Vector3,
): number {
  const short = solveTwoBone(b(bones, `${side}Arm`), b(bones, `${side}ForeArm`), b(bones, `${side}Hand`), wrist, pole);
  orientHand(bones, side, fingers, across);
  return short;
}

const ease = (t: number) => t * t * (3 - 2 * t);
