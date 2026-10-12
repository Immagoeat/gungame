import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_HEIGHT, type Loadout, type WeaponId } from '@gungame/shared';
import { LAYER_CCTV_ONLY, LAYER_SHADOW_PROXY } from '../../core/layers';
import { buildGun, type GunModel } from '../../weapons/gunModels';
import type { Avatar, AvatarState } from '../avatar';
import { handHolds, reach } from './handPoses';
import {
  bone, eyeInHead, findBones, rotateWorld, scaleToHeight, setWorldQuaternion, solveTwoBone, worldPos, type BoneMap,
} from './rig';

const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** Rough natural ground speeds of the walk and run clips, m/s. */
const WALK_CLIP_SPEED = 1.5;
const RUN_CLIP_SPEED = 4.2;

/**
 * The player's body as a rigged, animated character model (see AssetLibrary). Clips drive the legs
 * and body; stances, aiming and the hands on the gun are layered on top procedurally:
 * - crouching lowers the hips and keeps the feet planted with leg IK,
 * - lying prone and swimming tip the whole body over, with a crawl or a flutter kick,
 * - the spine and head follow the aim, and both arms reach for the gun with IK.
 *
 * Two copies of the skinned mesh share one skeleton: one seen by security cameras and an invisible
 * one that casts the shadow.
 */
export class CharacterAvatar implements Avatar {
  readonly group = new THREE.Group();
  /** Stance tilt and offset (prone, swimming) around the character. */
  private readonly body = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly bones: BoneMap;
  private readonly rest: { bone: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: { idle: THREE.AnimationAction; walk: THREE.AnimationAction; run: THREE.AnimationAction };
  /** The eyes, in the head bone's space. */
  private readonly eyeLocal: THREE.Vector3;
  private readonly gun = new THREE.Group();
  private gunModel: GunModel | null = null;
  private weapon: WeaponId = 'pistol';

  // Smoothed stance blends.
  private prone = 0;
  private swim = 0;
  private swimForward = 0;
  private aim = 0;
  private phase = 0;

  constructor(gltf: GLTF) {
    this.model = cloneSkinned(gltf.scene);
    this.bones = findBones(this.model);
    this.body.add(this.model);
    this.group.add(this.body, this.gun);

    scaleToHeight(this.model, this.bones, PLAYER_HEIGHT);

    for (const b of this.bones.values()) if (b instanceof THREE.Bone) this.rest.push({ bone: b, q: b.quaternion.clone(), p: b.position.clone() });

    this.eyeLocal = eyeInHead(this.bones);

    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (name: string) => {
      const c = gltf.animations.find(a => a.name.toLowerCase() === name) ?? gltf.animations[0];
      const action = this.mixer.clipAction(c);
      action.play();
      action.setEffectiveWeight(0);
      return action;
    };
    this.clips = { idle: clip('idle'), walk: clip('walk'), run: clip('run') };

    this.setupCopies();
  }

  /**
   * The whole body for security cameras, and an invisible copy that casts the shadow. Nothing is
   * drawn for the first-person camera: a body cut off below the eye shows its hollow inside and
   * shades the floor around your feet with ambient occlusion.
   */
  private setupCopies(): void {
    const meshes: THREE.SkinnedMesh[] = [];
    this.model.traverse(o => { if (o instanceof THREE.SkinnedMesh) meshes.push(o); });
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      const shadow = mesh.clone();
      shadow.material = shadowOnly;
      shadow.layers.set(LAYER_SHADOW_PROXY);
      shadow.castShadow = true;
      mesh.parent!.add(shadow);
      mesh.layers.set(LAYER_CCTV_ONLY);
      mesh.castShadow = false;
    }
  }

  setWeapon(id: WeaponId, loadout: Loadout): void {
    for (const c of [...this.gun.children]) this.gun.remove(c);
    this.gunModel?.dispose();
    this.weapon = id;
    const model = buildGun(id, loadout);
    this.gunModel = model;
    const visible = model.group;
    const proxy = visible.clone();
    visible.traverse(o => { o.layers.set(LAYER_CCTV_ONLY); if (o instanceof THREE.Mesh) o.castShadow = false; });
    proxy.traverse(o => {
      o.layers.set(LAYER_SHADOW_PROXY);
      if (o instanceof THREE.Mesh) { o.material = shadowOnly; o.castShadow = true; }
    });
    this.gun.add(visible, proxy);
  }

  update(dt: number, s: AvatarState): void {
    this.group.position.copy(s.pos);
    this.group.rotation.y = s.yaw;
    const k = 1 - Math.exp(-8 * dt);
    const proneNow = s.stance === 'prone' && !s.swimming;
    this.prone += ((proneNow ? 1 : 0) - this.prone) * k;
    this.swim += ((s.swimming ? 1 : 0) - this.swim) * k;
    this.swimForward += (Math.min(1, s.speed / 1.5) - this.swimForward) * k;
    this.aim += (s.pitch - this.aim) * (1 - Math.exp(-14 * dt));
    this.phase += dt * s.speed * (s.forward < -0.1 ? -1 : 1);

    // Clips: idle, walk and run by speed.
    for (const r of this.rest) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); }
    const moving = proneNow || s.swimming ? 0 : s.speed;
    const walkW = THREE.MathUtils.clamp(moving / 1.2, 0, 1) * (1 - THREE.MathUtils.clamp((moving - 3) / 2.5, 0, 1));
    const runW = THREE.MathUtils.clamp((moving - 3) / 2.5, 0, 1);
    const kick = s.swimming ? 0.6 + this.swimForward * 0.4 : 0;
    this.clips.idle.setEffectiveWeight(Math.max(0, 1 - walkW - runW - kick));
    this.clips.walk.setEffectiveWeight(walkW + kick);
    this.clips.run.setEffectiveWeight(runW);
    const dir = s.forward < -0.1 ? -1 : 1;
    this.clips.walk.timeScale = s.swimming ? 0.7 : dir * THREE.MathUtils.clamp(moving / WALK_CLIP_SPEED, 0.6, 1.6);
    this.clips.run.timeScale = dir * THREE.MathUtils.clamp(moving / RUN_CLIP_SPEED, 0.7, 1.7);
    this.mixer.update(dt);

    // Tip over for prone and swimming.
    this.body.rotation.x = -(Math.PI / 2 - 0.06) * this.prone - (0.35 + this.swimForward * 0.9) * this.swim;
    this.body.position.set(0, 0, 0);
    this.group.updateMatrixWorld(true);

    const q = this.group.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const b = (n: string) => bone(this.bones, n);

    // Lean and look: spread the aim pitch down the spine, the rest in the neck.
    const upright = 1 - Math.max(this.prone, this.swim);
    const crouch = s.stance === 'crouch' && !s.swimming ? 1 : 0;
    rotateWorld(b('Spine'), right, -0.22 * crouch * upright);
    for (const n of ['Spine1', 'Spine2']) rotateWorld(b(n), right, this.aim * 0.22 * upright);
    rotateWorld(b('Neck'), right, this.aim * 0.25 * upright + 0.55 * this.prone + (0.3 + this.swimForward * 0.5) * this.swim);
    rotateWorld(b('Head'), right, this.aim * 0.3 * upright + 0.55 * this.prone + (0.2 + this.swimForward * 0.3) * this.swim);

    // Legs.
    if (proneNow) this.crawl(right, up, s.speed);
    else if (!s.onGround && !s.swimming) {
      for (const side of ['Left', 'Right']) {
        rotateWorld(b(`${side}UpLeg`), right, 0.55);
        rotateWorld(b(`${side}Leg`), right, -1.0);
      }
    }

    // Put the eyes where the camera is: drop the hips (bending the legs) when upright, or move the
    // whole body when lying down or swimming.
    const eyeTarget = new THREE.Vector3(0, s.eyeHeight, 0).applyMatrix4(this.group.matrixWorld);
    const eye = this.eye();
    if (upright > 0.5 && s.onGround) {
      const drop = THREE.MathUtils.clamp(eye.y - eyeTarget.y, 0, 0.75);
      if (drop > 0.005) this.dropHips(drop, forward);
      const now = this.eye();
      this.body.position.set(eyeTarget.x - now.x, 0, eyeTarget.z - now.z).applyQuaternion(q.clone().invert()).multiplyScalar(0.6);
    } else {
      this.body.position.copy(eyeTarget.sub(eye).applyQuaternion(q.clone().invert()));
    }
    this.group.updateMatrixWorld(true);

    // The gun goes exactly where the first-person view model is; the hands go on it.
    this.gun.visible = !s.swimming && !!this.gunModel;
    if (this.gun.visible) {
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch);
      this.gun.position.set(0, s.eyeHeight, 0).add(s.gunOffset.clone().applyQuaternion(pitch));
      this.gun.quaternion.copy(pitch).multiply(s.gunRotation);
      this.gun.updateMatrixWorld(true);
      this.holdGun();
    } else this.swimStroke(right, forward);
  }

  /** Head bone to eyes, in world space. */
  private eye(): THREE.Vector3 {
    return bone(this.bones, 'Head').localToWorld(this.eyeLocal.clone());
  }

  /** Lowers the hips straight down and bends the legs to keep the feet where the clip put them. */
  private dropHips(drop: number, forward: THREE.Vector3): void {
    const b = (n: string) => bone(this.bones, n);
    const feet = (['Left', 'Right'] as const).map(side => ({
      side, pos: worldPos(b(`${side}Foot`)), q: b(`${side}Foot`).getWorldQuaternion(new THREE.Quaternion()),
    }));
    const hips = b('Hips');
    const target = worldPos(hips).add(new THREE.Vector3(0, -drop, 0));
    hips.position.copy(hips.parent!.worldToLocal(target));
    hips.updateMatrixWorld(true);
    for (const f of feet) {
      const knee = forward.clone().add(new THREE.Vector3(0, 0.2, 0));
      solveTwoBone(b(`${f.side}UpLeg`), b(`${f.side}Leg`), b(`${f.side}Foot`), f.pos, knee);
      setWorldQuaternion(b(`${f.side}Foot`), f.q);
    }
  }

  /** Lying face down: alternate frog kicks while moving. */
  private crawl(right: THREE.Vector3, up: THREE.Vector3, speed: number): void {
    const b = (n: string) => bone(this.bones, n);
    const moving = Math.min(1, speed / 0.8);
    const sin = Math.sin(this.phase * 3.2);
    const l = Math.max(0, sin) * moving;
    const r = Math.max(0, -sin) * moving;
    rotateWorld(b('LeftUpLeg'), up, -0.15 - 0.55 * l);
    rotateWorld(b('LeftLeg'), up, -1.1 * l);
    rotateWorld(b('RightUpLeg'), up, 0.15 + 0.55 * r);
    rotateWorld(b('RightLeg'), up, 1.1 * r);
    // Toes pointed back so the boots lie flat.
    for (const side of ['Left', 'Right']) rotateWorld(b(`${side}Foot`), right, -0.6);
  }

  /** Breaststroke while swimming (the gun is held clear of the water). */
  private swimStroke(right: THREE.Vector3, forward: THREE.Vector3): void {
    const b = (n: string) => bone(this.bones, n);
    const t = this.phase * 1.8 + performance.now() * 0.0015;
    for (const side of ['Left', 'Right'] as const) {
      const sx = side === 'Right' ? 1 : -1;
      const shoulder = worldPos(b(`${side}Arm`));
      const sweep = Math.sin(t);
      const target = shoulder.clone()
        .addScaledVector(forward, 0.38 + 0.15 * Math.cos(t))
        .addScaledVector(right, sx * (0.15 + 0.22 * Math.max(0, sweep)))
        .add(new THREE.Vector3(0, -0.15, 0));
      solveTwoBone(b(`${side}Arm`), b(`${side}ForeArm`), b(`${side}Hand`), target, new THREE.Vector3(0, -1, 0).addScaledVector(right, sx));
    }
  }

  private holdGun(): void {
    const gun = this.gunModel!;
    const m = this.gun.matrixWorld;
    const q = this.gun.getWorldQuaternion(new THREE.Quaternion());
    const holds = handHolds(gun, this.weapon);
    const toWorld = (v: THREE.Vector3) => v.applyMatrix4(m);
    const turn = (v: THREE.Vector3) => v.applyQuaternion(q);
    reach(this.bones, 'Right', holds.right, toWorld, turn);
    reach(this.bones, 'Left', holds.left, toWorld, turn);
  }
}
