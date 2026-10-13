import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER_HEIGHT, type WeaponId } from '@gungame/shared';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import { handHolds, reach } from '../entities/character/handPoses';
import { dressSoldier } from '../entities/character/soldierOutfit';
import { characterLook } from '../core/characterLook';
import {
  addArmsAttribute, bone, eyeInHead, findBones, regionMaterial, scaleToHeight, worldPos, type BoneMap,
} from '../entities/character/rig';
import { buildHand, humanMaterials, orientHand, type AddPart } from '../entities/human';
import type { GunModel } from './gunModels';

const add: AddPart = (parent, geo, mat, x, y, z, rot, scale) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
};

/** A tapered limb segment between two points. */
function limb(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mat: THREE.Material): void {
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 16, 1), mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  parent.add(m);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.02, 14, 10), mat);
  cap.position.copy(from);
  parent.add(cap);
}

/** The first-person arms. */
export interface ViewArms {
  object: THREE.Object3D;
  /**
   * true: `object` goes in the camera-space weapon scene and `update` poses it onto the gun every
   * frame. false: it's built in the gun's space and just rides along with the gun.
   */
  cameraSpace: boolean;
  /** Puts the hands on the gun, given the gun's camera-space transform. */
  update(gun: THREE.Matrix4): void;
}

/**
 * The player character's own arms when its model is loaded, otherwise modelled ones. `hip` is the
 * gun's camera-space transform when held at the hip (used to fit the body to the gun).
 */
export function buildViewArms(gun: GunModel, weapon: WeaponId, hip: THREE.Matrix4): ViewArms {
  return ModelArms.create(gun, weapon, hip) ?? { object: proceduralArms(gun, weapon), cameraSpace: false, update: () => {} };
}

/** Body turn: a rifle is held bladed, support shoulder forward. */
const TURN = { pistol: -0.15, long: -0.55 };

/**
 * The character's arms (everything else hidden). The body stands with its eyes at the
 * camera, so the shoulders stay put beside and below the view while two-bone IK reaches the hands to
 * the gun wherever it is (hip, aiming, recoil, reload). The forearms always come in from below at an
 * angle, never pointing straight at the camera.
 */
class ModelArms implements ViewArms {
  readonly cameraSpace = true;

  private constructor(
    readonly object: THREE.Group,
    private readonly bones: BoneMap,
    private readonly rest: { bone: THREE.Object3D; q: THREE.Quaternion }[],
    private readonly holds: ReturnType<typeof handHolds>,
  ) {}

  static create(gun: GunModel, weapon: WeaponId, hip: THREE.Matrix4): ModelArms | null {
    const gltf = getModel(MODEL_FILES.player);
    if (!gltf) return null;
    const pistol = weapon === 'pistol' || weapon === 'golden';
    const model = cloneSkinned(gltf.scene);
    const bones = findBones(model);
    try {
      scaleToHeight(model, bones, PLAYER_HEIGHT);
      dressSoldier(model, characterLook.get());
    } catch (err) {
      console.warn('First-person arms could not be built from the character model.', err);
      return null;
    }
    const eyeLocal = eyeInHead(bones);
    const root = new THREE.Group();
    root.add(model);
    model.rotation.y = pistol ? TURN.pistol : TURN.long;
    root.updateMatrixWorld(true);
    model.position.sub(bone(bones, 'Head').localToWorld(eyeLocal.clone()));
    const rest = [...bones.values()].map(b => ({ bone: b, q: b.quaternion.clone() }));
    const arms = new ModelArms(root, bones, rest, handHolds(gun, weapon));

    // Step the body towards the gun until both hands reach it at the hip.
    for (let i = 0; i < 5; i++) {
      const { worst, side } = arms.pose(hip);
      if (worst < 0.003) break;
      const hold = side === 'Right' ? arms.holds.right : arms.holds.left;
      const palm = hold.palm.clone().applyMatrix4(hip);
      model.position.add(palm.sub(worldPos(bone(bones, `${side}Arm`))).normalize().multiplyScalar(worst + 0.01));
    }

    model.traverse(o => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      // Whole arms, cut just short of the shoulder (which sits beside the camera, out of view).
      addArmsAttribute(o, 'armSkin', 0.47);
      o.material = regionMaterial(o.material as THREE.Material, 'armSkin', 'above');
      o.castShadow = false;
      o.frustumCulled = false;
    });
    arms.update(hip);
    return arms;
  }

  update(gun: THREE.Matrix4): void {
    this.pose(gun);
  }

  private pose(gun: THREE.Matrix4): { worst: number; side: 'Left' | 'Right' } {
    for (const r of this.rest) r.bone.quaternion.copy(r.q);
    this.object.updateMatrixWorld(true);
    const q = new THREE.Quaternion().setFromRotationMatrix(gun);
    const toCamera = (v: THREE.Vector3) => v.applyMatrix4(gun);
    const turn = (v: THREE.Vector3) => v.applyQuaternion(q);
    const right = reach(this.bones, 'Right', this.holds.right, toCamera, turn);
    const left = reach(this.bones, 'Left', this.holds.left, toCamera, turn);
    return right >= left ? { worst: right, side: 'Right' } : { worst: left, side: 'Left' };
  }
}

/**
 * First-person arms in jacket sleeves, hands posed onto the gun: shooting hand on the grip with the
 * index finger on the trigger, support hand under the handguard (or cupped around the pistol grip).
 * Built in the gun's own space so they move with it.
 */
function proceduralArms(gun: GunModel, weapon: WeaponId): THREE.Group {
  const m = humanMaterials();
  const g = new THREE.Group();
  const pistol = weapon === 'pistol' || weapon === 'golden';
  const gripAngle = 0.28;

  // Shooting hand: palm against the right side of the grip, fingers wrapping round the front.
  const right = buildHand(add, m.skin, 'right', 0.95, true);
  const rFingers = new THREE.Vector3(0, -Math.sin(gripAngle) - 0.15, -1).normalize();
  orientHand(right.root, rFingers, new THREE.Vector3(-1, 0, 0));
  const rPalm = new THREE.Vector3(0.03, -0.045, 0.018);
  const rWrist = rPalm.clone().addScaledVector(rFingers, -0.05);
  right.root.position.copy(rWrist);
  g.add(right.root);
  const rElbow = rWrist.clone().add(new THREE.Vector3(0.1, -0.3, 0.3));
  limb(g, rWrist, rWrist.clone().lerp(rElbow, 0.45), 0.026, 0.033, m.skin);
  limb(g, rWrist.clone().lerp(rElbow, 0.4), rElbow, 0.04, 0.05, m.jacket);
  limb(g, rWrist.clone().lerp(rElbow, 0.38), rWrist.clone().lerp(rElbow, 0.44), 0.043, 0.043, m.jacketDark);

  // Support hand.
  const left = buildHand(add, m.skin, 'left', 0.85);
  let lWrist: THREE.Vector3;
  let lElbow: THREE.Vector3;
  if (pistol) {
    const lFingers = new THREE.Vector3(0.15, -0.3, -1).normalize();
    orientHand(left.root, lFingers, new THREE.Vector3(1, 0, 0));
    lWrist = new THREE.Vector3(-0.034, -0.06, 0.02).addScaledVector(lFingers, -0.045);
    lElbow = lWrist.clone().add(new THREE.Vector3(-0.12, -0.3, 0.3));
  } else {
    const s = gun.supportHand;
    const lFingers = new THREE.Vector3(-1, 0.35, -0.25).normalize();
    orientHand(left.root, lFingers, new THREE.Vector3(0, 1, 0));
    lWrist = new THREE.Vector3(s.x + 0.035, s.y - 0.045, s.z).addScaledVector(lFingers, -0.03);
    lElbow = lWrist.clone().add(new THREE.Vector3(-0.24, -0.3, 0.26));
  }
  left.root.position.copy(lWrist);
  g.add(left.root);
  limb(g, lWrist, lWrist.clone().lerp(lElbow, 0.45), 0.026, 0.033, m.skin);
  limb(g, lWrist.clone().lerp(lElbow, 0.4), lElbow, 0.04, 0.05, m.jacket);
  limb(g, lWrist.clone().lerp(lElbow, 0.38), lWrist.clone().lerp(lElbow, 0.44), 0.043, 0.043, m.jacketDark);

  // Watch on the support wrist.
  const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 16), m.metal);
  watch.position.copy(lWrist.clone().lerp(lElbow, 0.12));
  watch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lElbow.clone().sub(lWrist).normalize().cross(new THREE.Vector3(0, 0, 1)).normalize());
  g.add(watch);

  g.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = false; });
  return g;
}
