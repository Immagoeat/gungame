import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_LOOK, PLAYER_HEIGHT, type CharacterLook, type Loadout, type WeaponId } from '@gungame/shared';
import { LAYER_CCTV_ONLY, LAYER_SHADOW_PROXY } from '../../core/layers';
import { buildGun, type GunModel } from '../../weapons/gunModels';
import type { Avatar, AvatarState } from '../avatar';
import { handHolds, reach } from './handPoses';
import { bodyFrame, captureFootRest, dropHips, lookAt, placeHand, sit, type FootRest } from './poseKit';
import { crowdMaterial, crowdPalette, dressSoldier, type CivilianStyle } from './soldierOutfit';
import {
  bone, eyeInHead, findBones, rotateWorld, scaleToHeight, solveTwoBone, worldPos, type BoneMap,
} from './rig';

const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const npcGunMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.55 });

/** Collapses a gun model into a single mesh in a single dark material. */
function npcGun(group: THREE.Object3D): THREE.Mesh {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const geos: THREE.BufferGeometry[] = [];
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = o.geometry.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    geos.push(g);
  });
  const merged = mergeGeometries(geos) ?? new THREE.BufferGeometry();
  geos.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(merged, npcGunMaterial);
  mesh.position.copy(group.position);
  mesh.quaternion.copy(group.quaternion);
  mesh.scale.copy(group.scale);
  return mesh;
}

/** Rough natural ground speeds of the walk and run clips, m/s. */
const WALK_CLIP_SPEED = 1.5;
/** How far the model's eyes may sit above the camera before the legs bend (meters). */
const STAND_SLACK = 0.1;
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
  private readonly feet: FootRest;
  /** Smoothed ear-touch blend. */
  private ear = 0;
  private readonly gun = new THREE.Group();
  private gunModel: GunModel | null = null;
  private weapon: WeaponId = 'pistol';

  // Smoothed stance blends.
  private prone = 0;
  private swim = 0;
  private swimForward = 0;
  private aim = 0;
  private phase = 0;

  /** Seen by the player directly (guards, hostages), rather than only by cameras and shadows. */
  private readonly npc: boolean;
  /** Far away: skip drawing the gun (it's a few pixels). */
  gunCulled = false;

  constructor(gltf: GLTF, look: CharacterLook = DEFAULT_LOOK, opts: { npc?: boolean; civ?: CivilianStyle; height?: number } = {}) {
    this.npc = !!opts.npc;
    this.model = cloneSkinned(gltf.scene);
    this.bones = findBones(this.model);
    this.body.add(this.model);
    this.group.add(this.body, this.gun);

    scaleToHeight(this.model, this.bones, opts.height ?? PLAYER_HEIGHT);
    dressSoldier(this.model, look, opts.civ);
    if (opts.civ) {
      const material = crowdMaterial(crowdPalette(look, opts.civ));
      this.model.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.material = material; });
    }

    for (const b of this.bones.values()) if (b instanceof THREE.Bone) this.rest.push({ bone: b, q: b.quaternion.clone(), p: b.position.clone() });

    this.eyeLocal = eyeInHead(this.bones);
    this.feet = captureFootRest(this.bones, this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (name: string) => {
      const c = gltf.animations.find(a => a.name.toLowerCase() === name) ?? gltf.animations[0];
      const action = this.mixer.clipAction(c);
      action.play();
      action.setEffectiveWeight(0);
      return action;
    };
    this.clips = { idle: clip('idle'), walk: clip('walk'), run: clip('run') };

    if (this.npc) this.setupNpc();
    else this.setupCopies();
  }

  /** NPC: drawn normally, culled when off screen. */
  private setupNpc(): void {
    const unit = 1 / this.model.scale.x;
    this.model.traverse(o => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      o.castShadow = false;
      o.receiveShadow = true;
      o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95 * unit, 0), 1.6 * unit);
      o.frustumCulled = true;
    });
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

  /** No weapon (a hostage, a guest): arms free. */
  clearWeapon(): void {
    for (const c of [...this.gun.children]) this.gun.remove(c);
    this.gunModel?.dispose();
    this.gunModel = null;
  }

  setWeapon(id: WeaponId, loadout: Loadout): void {
    for (const c of [...this.gun.children]) this.gun.remove(c);
    this.gunModel?.dispose();
    this.weapon = id;
    const model = buildGun(id, loadout);
    this.gunModel = model;
    const visible = model.group;
    if (this.npc) {
      // One mesh, one material: an NPC's gun is seen at a distance, and a crowd of guns made of many
      // parts and materials costs a lot of draw calls.
      this.gun.add(npcGun(visible));
      return;
    }
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
    const frame = bodyFrame(this.group);
    if (s.seat && (s.seat.blend ?? 1) > 0) {
      // Seated (cutscenes): the seat decides the height, not the camera.
      sit(this.bones, frame, this.feet, { ...s.seat });
    } else if (upright > 0.5 && s.onGround) {
      // Standing tall: the model's eyes sit a little above the camera's, which is fine; only crouch
      // when the camera is clearly lower, so the legs stay straight when standing and walking.
      const drop = THREE.MathUtils.clamp(eye.y - eyeTarget.y - STAND_SLACK, 0, 0.75);
      if (drop > 0.005) dropHips(this.bones, frame, drop);
      const now = this.eye();
      this.body.position.set(eyeTarget.x - now.x, 0, eyeTarget.z - now.z).applyQuaternion(q.clone().invert()).multiplyScalar(0.6);
    } else {
      this.body.position.copy(eyeTarget.sub(eye).applyQuaternion(q.clone().invert()));
    }
    this.group.updateMatrixWorld(true);

    if (s.lookAt) lookAt(this.bones, frame, s.lookAt, 0.8);

    // Collapsed: tip over backwards around the feet onto the ground, gun dropped.
    const down = s.down ?? 0;
    if (down > 0) {
      const e = down * down * (3 - 2 * down);
      this.body.rotation.x = (Math.PI / 2 - 0.08) * e;
      this.body.position.set(0, 0.13 * e, 0);
      this.gun.visible = false;
      return;
    }
    if (s.restrained) {
      // Wrists together behind the back.
      const hips = worldPos(bone(this.bones, 'Hips'));
      for (const side of ['Left', 'Right'] as const) {
        const sx = side === 'Right' ? 1 : -1;
        const wrist = hips.clone().addScaledVector(frame.forward, -0.2).addScaledVector(frame.right, sx * 0.04).add(new THREE.Vector3(0, 0.05, 0));
        placeHand(this.bones, side, wrist, frame.right.clone().multiplyScalar(sx).addScaledVector(frame.forward, -0.4), new THREE.Vector3(0, -1, 0), frame.right.clone().multiplyScalar(-sx));
      }
      this.gun.visible = false;
      return;
    }

    // The gun goes where the first-person view model is (so cameras and shadows match what you see),
    // or, in cutscenes, where a body-relative carry puts it; the hands go on it.
    this.gun.visible = !s.swimming && !!this.gunModel && !this.gunCulled;
    if (!this.gunModel && !s.swimming) return; // unarmed: the clip's arms
    if (this.gun.visible) {
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch);
      this.gun.position.set(0, s.eyeHeight, 0).add(s.gunOffset.clone().applyQuaternion(pitch));
      this.gun.quaternion.copy(pitch).multiply(s.gunRotation);
      if (s.hold && s.hold.blend > 0) this.carry(s.hold.kind, s.hold.blend, s.hold.rise);
      this.gun.updateMatrixWorld(true);
      this.holdGun(s.hold?.kind !== 'relaxed' || s.hold.blend < 0.5);
      this.ear += ((s.touchEar ?? 0) - this.ear) * (1 - Math.exp(-10 * dt));
      if (this.ear > 0.01) this.touchEar(frame, this.ear);
    } else this.swimStroke(right, forward);
  }

  /**
   * Body-relative gun carries, blended over the camera hold by `k`:
   * - lowReady: pistol out in front at arm's length, muzzle angled at the ground; rifle with the
   *   stock in the shoulder and the muzzle down.
   * - seated: resting between the knees, muzzle down.
   * - relaxed: at ease, in the right hand only, hanging by the thigh (pistol) or across the body (rifle).
   * Positions are in the avatar group's space (the gun's parent), from the posed skeleton.
   */
  private carry(kind: 'lowReady' | 'seated' | 'relaxed', k: number, rise?: number): void {
    let { pos, quat } = this.carryPose(kind);
    if (rise !== undefined) {
      const up = this.carryPose('lowReady');
      const e = rise * rise * (3 - 2 * rise);
      pos = this.carryPose('seated').pos.lerp(up.pos, e);
      quat = this.carryPose('seated').quat.slerp(up.quat, e);
    }
    this.gun.position.lerp(pos, k);
    this.gun.quaternion.slerp(quat, k);
  }

  private carryPose(kind: 'lowReady' | 'seated' | 'relaxed'): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const toLocal = (v: THREE.Vector3) => this.group.worldToLocal(v);
    const pistol = this.weapon === 'pistol' || this.weapon === 'golden';
    const chest = toLocal(worldPos(bone(this.bones, 'Spine2')));
    const hips = toLocal(worldPos(bone(this.bones, 'Hips')));
    const shoulder = toLocal(worldPos(bone(this.bones, 'RightArm')));
    let pos: THREE.Vector3;
    let rot: THREE.Euler;
    if (kind === 'relaxed') {
      pos = pistol ? hips.add(new THREE.Vector3(0.23, -0.12, -0.1)) : chest.add(new THREE.Vector3(0.06, -0.34, -0.2));
      rot = pistol ? new THREE.Euler(-1.4, 0.15, 0, 'YXZ') : new THREE.Euler(-1.15, 0.1, 0.55, 'YXZ');
    } else if (kind === 'seated') {
      pos = hips.add(new THREE.Vector3(0.02, pistol ? 0.06 : 0.25, -0.36));
      rot = new THREE.Euler(pistol ? -1.25 : 1.35, pistol ? 0.1 : 0.05, 0, 'YXZ');
    } else if (pistol) {
      pos = chest.add(new THREE.Vector3(0.03, -0.32, -0.4));
      rot = new THREE.Euler(-0.8, 0.12, 0, 'YXZ');
    } else {
      pos = shoulder.add(new THREE.Vector3(-0.07, -0.2, -0.3));
      rot = new THREE.Euler(-0.6, 0.28, 0.05, 'YXZ');
    }
    return { pos, quat: new THREE.Quaternion().setFromEuler(rot) };
  }

  /** Left hand up to the headset on the left ear, as if keying the radio. */
  private touchEar(frame: ReturnType<typeof bodyFrame>, k: number): void {
    const head = worldPos(bone(this.bones, 'Head'));
    const ear = head.clone().add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(frame.right, -0.13).addScaledVector(frame.forward, 0.01);
    const wristAtEar = ear.clone().addScaledVector(frame.up, -0.07).addScaledVector(frame.right, -0.03);
    const wristNow = worldPos(bone(this.bones, 'LeftHand'));
    const wrist = wristNow.lerp(wristAtEar, k);
    const pole = frame.right.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -0.6, 0));
    placeHand(this.bones, 'Left', wrist, pole, frame.up.clone().addScaledVector(frame.forward, 0.3), frame.forward.clone().multiplyScalar(-1));
  }

  /** Head bone to eyes, in world space. */
  private eye(): THREE.Vector3 {
    return bone(this.bones, 'Head').localToWorld(this.eyeLocal.clone());
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

  /** Hands on the gun: the right on the grip, and the left too unless `both` is false. */
  private holdGun(both = true): void {
    const gun = this.gunModel!;
    const m = this.gun.matrixWorld;
    const q = this.gun.getWorldQuaternion(new THREE.Quaternion());
    const holds = handHolds(gun, this.weapon);
    const toWorld = (v: THREE.Vector3) => v.applyMatrix4(m);
    const turn = (v: THREE.Vector3) => v.applyQuaternion(q);
    reach(this.bones, 'Right', holds.right, toWorld, turn);
    if (both) reach(this.bones, 'Left', holds.left, toWorld, turn);
  }
}
