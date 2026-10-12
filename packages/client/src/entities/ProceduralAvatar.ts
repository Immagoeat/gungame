import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Loadout, WeaponId } from '@gungame/shared';
import { LAYER_CCTV_ONLY, LAYER_SHADOW_PROXY } from '../core/layers';
import { buildGun, type GunModel } from '../weapons/gunModels';
import type { Avatar, AvatarState } from './avatar';
import { buildHand, buildHead, humanMaterials, type AddPart } from './human';

/**
 * Which copies of a part to make:
 * - 'body': hips and legs. Drawn for everyone (you see your legs when you look down) and casts shadows.
 * - 'upper': torso, head, arms, rifle. Drawn only for security cameras, plus an invisible copy that casts
 *   the shadow, so they never block the first-person view.
 */
type PartKind = 'body' | 'upper';

const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

interface Joints {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  ankleL: THREE.Group;
  ankleR: THREE.Group;
  rifle: THREE.Group;
}

/** Target joint angles (radians) and hip placement for a pose; blended smoothly each frame. */
interface Pose {
  hipsY: number;
  hipsZ: number;
  hipsPitch: number;
  spine: number;
  neck: number;
  shL: [number, number];
  shR: [number, number];
  elL: number;
  elR: number;
  thL: number;
  thR: number;
  knL: number;
  knR: number;
  anL: number;
  anR: number;
  rifle: boolean;
}

const JOINT_KEYS = ['hipsY', 'hipsZ', 'hipsPitch', 'spine', 'neck', 'elL', 'elR', 'thL', 'thR', 'knL', 'knR', 'anL', 'anR'] as const;

/**
 * The player's body: a man in a field jacket, shirt, cargo trousers and boots, with a sculpted face,
 * hair and hands, holding the equipped (customized) weapon. Jointed skeleton with procedural walk,
 * run, crouch, crawl and swim cycles. Used when the character model file isn't available.
 */
export class ProceduralAvatar implements Avatar {
  readonly group = new THREE.Group();
  private readonly j: Joints;
  private pose: Pose = ProceduralAvatar.standPose();
  private phase = 0;
  /** Smoothed look pitch, so the gun follows the aim. */
  private aim = 0;
  private prone = false;
  /** Where the hands hold the current gun, in the gun holder's space. */
  private readonly gripTarget = new THREE.Vector3(0, 0, 0.06);
  private readonly supportTarget = new THREE.Vector3(0, 0.01, -0.27);
  private gunModel: GunModel | null = null;

  constructor() {
    this.j = this.build();
    this.group.add(this.j.root);
  }

  update(dt: number, s: AvatarState): void {
    this.group.position.copy(s.pos);
    this.group.rotation.y = s.yaw;
    const moving = Math.min(1, s.speed / 3);
    const cadence = s.swimming ? 2.2 : s.stance === 'prone' ? 3.2 : s.stance === 'crouch' ? 6 : 4.2 + s.speed * 0.9;
    this.phase += dt * cadence * Math.max(moving, s.swimming ? 0.5 : 0) * (s.forward < -0.1 ? -1 : 1);

    const target = s.swimming ? this.swimPose(s) : s.stance === 'prone' ? this.pronePose(moving)
      : s.stance === 'crouch' ? this.crouchPose(moving) : this.standPose(moving, s);
    if (!s.onGround && !s.swimming) {
      target.thL = target.thR = 0.5;
      target.knL = target.knR = -0.9;
    }
    // Look up/down with the head (and a little with the spine) unless lying down.
    if (s.stance !== 'prone' && !s.swimming) {
      target.neck += s.pitch * 0.55;
      target.spine -= s.pitch * 0.25;
      const aim = s.aiming ? 0.25 : 0;
      target.shR = [target.shR[0] + s.pitch * 0.7 + aim, target.shR[1]];
      target.shL = [target.shL[0] + s.pitch * 0.7 + aim, target.shL[1]];
    }

    const k = 1 - Math.exp(-12 * dt);
    this.aim += (s.pitch - this.aim) * k;
    this.prone = s.stance === 'prone' && !s.swimming;
    const p = this.pose;
    for (const key of JOINT_KEYS) p[key] += (target[key] - p[key]) * k;
    p.shL = [p.shL[0] + (target.shL[0] - p.shL[0]) * k, p.shL[1] + (target.shL[1] - p.shL[1]) * k];
    p.shR = [p.shR[0] + (target.shR[0] - p.shR[0]) * k, p.shR[1] + (target.shR[1] - p.shR[1]) * k];
    p.rifle = target.rifle;
    this.apply();
  }

  // ---------- Poses ----------

  private static standPose(): Pose {
    return {
      hipsY: 0.92, hipsZ: 0, hipsPitch: 0, spine: 0.05, neck: 0,
      shL: [1.25, 0.55], shR: [1.1, -0.25], elL: 0.35, elR: 1.25,
      thL: 0, thR: 0, knL: 0, knR: 0, anL: 0, anR: 0, rifle: true,
    };
  }

  private standPose(moving: number, s: AvatarState): Pose {
    const p = ProceduralAvatar.standPose();
    const run = Math.min(1, s.speed / 8);
    const amp = (0.45 + run * 0.35) * moving;
    const sin = Math.sin(this.phase);
    p.thL = sin * amp;
    p.thR = -sin * amp;
    p.knL = -Math.max(0, -Math.sin(this.phase - 0.6)) * (0.6 + run * 0.8) * moving;
    p.knR = -Math.max(0, Math.sin(this.phase - 0.6)) * (0.6 + run * 0.8) * moving;
    p.anL = -p.knL * 0.3;
    p.anR = -p.knR * 0.3;
    p.hipsY = 0.92 - Math.abs(Math.cos(this.phase)) * 0.04 * moving;
    p.spine = 0.05 + run * 0.15;
    return p;
  }

  private crouchPose(moving: number): Pose {
    const p = ProceduralAvatar.standPose();
    const sin = Math.sin(this.phase);
    p.hipsY = 0.56;
    p.spine = 0.3;
    p.neck = 0.25;
    p.thL = 1.3 + sin * 0.35 * moving;
    p.thR = 0.75 - sin * 0.35 * moving;
    p.knL = -2.15 + Math.max(0, sin) * 0.4 * moving;
    p.knR = -1.3 - Math.max(0, -sin) * 0.4 * moving;
    p.anL = 0.85;
    p.anR = 0.55;
    return p;
  }

  private pronePose(moving: number): Pose {
    const sin = Math.sin(this.phase);
    return {
      // Lying face down, head forward: hips pushed back so the head is where the camera is.
      hipsY: 0.2, hipsZ: 0.78, hipsPitch: -Math.PI / 2 + 0.06, spine: 0.04, neck: 1.25,
      shL: [2.7 + sin * 0.35 * moving, 0.35], shR: [2.75 - sin * 0.35 * moving, -0.2],
      elL: 0.9, elR: 1.3,
      thL: 0.1 + Math.max(0, sin) * 0.6 * moving, thR: 0.1 + Math.max(0, -sin) * 0.6 * moving,
      knL: -0.15 - Math.max(0, sin) * 1.0 * moving, knR: -0.15 - Math.max(0, -sin) * 1.0 * moving,
      anL: -0.6, anR: -0.6, rifle: true,
    };
  }

  private swimPose(s: AvatarState): Pose {
    const kick = Math.sin(this.phase * 3);
    const stroke = this.phase;
    const forward = Math.min(1, s.speed / 1.5);
    return {
      hipsY: 1.05, hipsZ: 0.35 * forward, hipsPitch: -0.35 - forward * 0.9, spine: 0.1, neck: 0.4 + forward * 0.6,
      shL: [1.6 + Math.sin(stroke) * 1.1, 0.4 + Math.cos(stroke) * 0.6], shR: [1.6 + Math.sin(stroke) * 1.1, -0.4 - Math.cos(stroke) * 0.6],
      elL: 0.5 + Math.max(0, Math.cos(stroke)) * 0.9, elR: 0.5 + Math.max(0, Math.cos(stroke)) * 0.9,
      thL: kick * 0.35, thR: -kick * 0.35, knL: -0.3 - Math.max(0, kick) * 0.4, knR: -0.3 - Math.max(0, -kick) * 0.4,
      anL: -0.7, anR: -0.7, rifle: false,
    };
  }

  private apply(): void {
    const { j, pose: p } = this;
    j.hips.position.set(0, p.hipsY, p.hipsZ);
    j.hips.rotation.x = p.hipsPitch;
    j.spine.rotation.x = -p.spine;
    // Positive neck = lift the face (look up).
    j.neck.rotation.x = p.neck * 0.5;
    j.head.rotation.x = p.neck * 0.5;
    j.shoulderL.rotation.set(p.shL[0], 0, p.shL[1]);
    j.shoulderR.rotation.set(p.shR[0], 0, p.shR[1]);
    j.elbowL.rotation.x = p.elL;
    j.elbowR.rotation.x = p.elR;
    j.hipL.rotation.x = p.thL;
    j.hipR.rotation.x = p.thR;
    j.kneeL.rotation.x = p.knL;
    j.kneeR.rotation.x = p.knR;
    j.ankleL.rotation.x = p.anL;
    j.ankleR.rotation.x = p.anR;
    j.rifle.visible = p.rifle;
    if (!p.rifle) return;

    // Hold the gun level with the aim (or flat along the ground when prone), then reach for it.
    if (this.prone) {
      j.rifle.position.set(0.07, 0.62, -0.17);
      j.rifle.rotation.set(Math.PI / 2 - 0.05, 0, 0);
    } else {
      j.rifle.position.set(0.1, 0.24, -0.3);
      j.rifle.rotation.set(p.spine + this.aim * 0.8, 0, 0);
    }
    const toSpine = (local: THREE.Vector3) => local.clone().applyEuler(j.rifle.rotation).add(j.rifle.position);
    solveArm(j.shoulderR, j.elbowR, toSpine(this.gripTarget), new THREE.Vector3(0.6, -1, 0.3));
    solveArm(j.shoulderL, j.elbowL, toSpine(this.supportTarget), new THREE.Vector3(-0.6, -1, 0.3));
  }

  // ---------- Model ----------

  /** Puts the equipped weapon (with its attachments) in the character's hands. */
  setWeapon(id: WeaponId, loadout: Loadout): void {
    const holder = this.j.rifle;
    for (const c of [...holder.children]) holder.remove(c);
    this.gunModel?.dispose();
    const model = buildGun(id, loadout);
    this.gunModel = model;
    const gun = model.group;
    const pistol = id === 'pistol' || id === 'golden';
    gun.position.set(pistol ? 0.03 : 0.0, pistol ? 0.02 : 0, pistol ? -0.12 : 0.06);
    // Hands go on the grip and the support point (cupped under the grip for a pistol).
    this.gripTarget.copy(gun.position).add(new THREE.Vector3(0.02, -0.04, 0.05));
    if (pistol) this.supportTarget.copy(gun.position).add(new THREE.Vector3(-0.03, -0.06, 0.06));
    else this.supportTarget.copy(gun.position).add(model.supportHand).add(new THREE.Vector3(-0.02, -0.035, 0.02));
    // Visible to security cameras; an invisible copy casts the shadow.
    const visible = gun;
    const proxy = gun.clone();
    visible.traverse(o => { o.layers.set(LAYER_CCTV_ONLY); if (o instanceof THREE.Mesh) o.castShadow = false; });
    proxy.traverse(o => {
      o.layers.set(LAYER_SHADOW_PROXY);
      if (o instanceof THREE.Mesh) { o.material = shadowOnly; o.castShadow = true; }
    });
    holder.add(visible, proxy);
  }

  private build(): Joints {
    const m = humanMaterials();
    const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    let kind: PartKind = 'body';
    const part: AddPart = (parent, g, mat, x, y, z, rot, scale) => {
      const place = (mesh: THREE.Mesh) => {
        mesh.position.set(x, y, z);
        if (rot) mesh.rotation.set(...rot);
        if (scale) mesh.scale.set(...scale);
        parent.add(mesh);
        return mesh;
      };
      if (kind === 'body') {
        const mesh = place(new THREE.Mesh(g, mat));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      }
      const visible = place(new THREE.Mesh(g, mat));
      visible.layers.set(LAYER_CCTV_ONLY);
      const proxy = place(new THREE.Mesh(g, shadowOnly));
      proxy.layers.set(LAYER_SHADOW_PROXY);
      proxy.castShadow = true;
      return visible;
    };
    /** Smooth tapered limb along -y from the joint, as a lathe of radii. */
    const limb = (parent: THREE.Object3D, profile: [number, number][], mat: THREE.Material, sx = 1, sz = 1) =>
      part(parent, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, -y)), 20), mat, 0, 0, 0, undefined, [sx, 1, sz]);

    const root = new THREE.Group();
    const hips = joint(root, 0, 0.92, 0);

    // ---- Lower body (seen in first person): trousers, belt with holster, boots.
    kind = 'body';
    part(hips, new THREE.LatheGeometry([[0.001, -0.1], [0.14, -0.09], [0.155, 0.0], [0.145, 0.09], [0.001, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 22), m.pants, 0, 0, 0, undefined, [1.05, 1, 0.72]);
    part(hips, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24), m.belt, 0, 0.075, 0, undefined, [1.04, 1, 0.74]);
    part(hips, new THREE.BoxGeometry(0.045, 0.035, 0.012), m.metal, 0, 0.075, -0.112);
    part(hips, new THREE.BoxGeometry(0.05, 0.16, 0.1), m.belt, 0.17, -0.02, 0.0, [0, 0, 0.05]);
    part(hips, new THREE.BoxGeometry(0.035, 0.05, 0.09), m.metal, 0.17, 0.08, 0.0);
    const leg = (side: 1 | -1) => {
      const hip = joint(hips, side * 0.085, -0.05, 0);
      limb(hip, [[0.088, 0], [0.09, 0.08], [0.078, 0.25], [0.062, 0.41]], m.pants, 1, 1.05);
      part(hip, new THREE.BoxGeometry(0.03, 0.13, 0.11), m.pants, side * 0.085, -0.24, 0.0);
      part(hip, new THREE.BoxGeometry(0.032, 0.02, 0.112), m.jacketDark, side * 0.086, -0.18, 0.0);
      const knee = joint(hip, 0, -0.42, 0);
      part(knee, new THREE.SphereGeometry(0.062, 16, 12), m.pants, 0, 0, -0.005);
      limb(knee, [[0.06, 0], [0.064, 0.1], [0.05, 0.3], [0.042, 0.38]], m.pants, 1, 1.1);
      const ankle = joint(knee, 0, -0.42, 0);
      limb(ankle, [[0.052, -0.12], [0.056, 0], [0.058, 0.04]], m.boot);
      part(ankle, new RoundedBoxGeometry(0.1, 0.075, 0.27, 3, 0.03), m.boot, 0, -0.025, -0.06);
      part(ankle, new RoundedBoxGeometry(0.106, 0.025, 0.285, 2, 0.01), m.sole, 0, -0.06, -0.06);
      for (let i = 0; i < 4; i++) part(ankle, new THREE.BoxGeometry(0.06, 0.004, 0.008), m.belt, 0, 0.02 - i * 0.022, -0.065 - i * 0.012);
      return { hip, knee, ankle };
    };
    const legL = leg(-1);
    const legR = leg(1);

    // ---- Upper body (seen by cameras and in shadows): jacket over a shirt, head, arms.
    kind = 'upper';
    const spine = joint(hips, 0, 0.08, 0);
    const torso: [number, number][] = [[0.14, 0], [0.135, 0.08], [0.15, 0.2], [0.17, 0.32], [0.175, 0.38], [0.15, 0.43], [0.08, 0.47], [0.001, 0.48]];
    part(spine, new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 26), m.jacket, 0, 0, 0, undefined, [1.18, 1, 0.74]);
    part(spine, new THREE.TorusGeometry(0.068, 0.018, 8, 22), m.jacketDark, 0, 0.455, 0.0, [Math.PI / 2, 0, 0], [1.1, 1, 0.9]);
    part(spine, new THREE.BoxGeometry(0.008, 0.4, 0.006), m.metal, 0, 0.23, -0.128);
    for (const sx of [-1, 1]) {
      part(spine, new RoundedBoxGeometry(0.08, 0.06, 0.02, 2, 0.008), m.jacketDark, sx * 0.08, 0.33, -0.123);
      part(spine, new RoundedBoxGeometry(0.075, 0.07, 0.018, 2, 0.008), m.jacketDark, sx * 0.1, 0.09, -0.112);
      part(spine, new THREE.BoxGeometry(0.004, 0.32, 0.004), m.jacketDark, sx * 0.19, 0.22, 0);
    }
    part(spine, new THREE.CylinderGeometry(0.15, 0.155, 0.04, 24), m.jacketDark, 0, 0.0, 0, undefined, [1.15, 1, 0.75]);
    part(spine, new RoundedBoxGeometry(0.08, 0.12, 0.03, 2, 0.01), m.shirt, 0, 0.43, -0.08);

    const neck = joint(spine, 0, 0.47, 0);
    part(neck, new THREE.CylinderGeometry(0.048, 0.056, 0.1, 16), m.skin, 0, 0.03, 0.005);
    const head = joint(neck, 0, 0.06, 0);
    buildHead(head, part, m);

    const arm = (side: 1 | -1) => {
      const shoulder = joint(spine, side * 0.2, 0.41, 0);
      part(shoulder, new THREE.SphereGeometry(0.062, 18, 14), m.jacket, 0, -0.01, 0, undefined, [1, 0.95, 0.95]);
      limb(shoulder, [[0.056, 0], [0.058, 0.06], [0.05, 0.2], [0.044, 0.29]], m.jacket);
      const elbow = joint(shoulder, 0, -0.29, 0);
      part(elbow, new THREE.SphereGeometry(0.045, 14, 10), m.jacket, 0, 0, 0);
      limb(elbow, [[0.045, 0], [0.046, 0.06], [0.036, 0.2], [0.034, 0.21]], m.jacket);
      limb(elbow, [[0.037, 0.2], [0.039, 0.215], [0.037, 0.23]], m.jacketDark);
      limb(elbow, [[0.03, 0.22], [0.027, 0.25]], m.skin);
      const hand = buildHand(part, m.skin, side === 1 ? 'right' : 'left', 0.85, side === 1);
      hand.root.position.set(0, -0.255, 0);
      hand.root.rotation.y = side * Math.PI / 2;
      elbow.add(hand.root);
      return { shoulder, elbow };
    };
    const left = arm(-1);
    const right = arm(1);

    // The weapon sits across the chest; setWeapon fills it.
    const rifle = joint(spine, 0.09, 0.2, -0.3);

    return {
      root, hips, spine, neck, head,
      shoulderL: left.shoulder, shoulderR: right.shoulder, elbowL: left.elbow, elbowR: right.elbow,
      hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee, ankleL: legL.ankle, ankleR: legR.ankle,
      rifle,
    };
  }
}

const UPPER_ARM = 0.29;
const FOREARM = 0.255;

/**
 * Two-bone IK: rotates the shoulder and bends the elbow so the wrist reaches `target`, with the
 * elbow pushed towards `pole`. All vectors are in the shoulder's parent (spine) space; arms hang
 * along their local -y and elbows bend towards local -z.
 */
function solveArm(shoulder: THREE.Object3D, elbow: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void {
  const s = shoulder.position;
  const toTarget = target.clone().sub(s);
  const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(UPPER_ARM - FOREARM) + 0.01, UPPER_ARM + FOREARM - 0.001);
  const dir = toTarget.normalize();
  const along = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - along * along));
  const bendDir = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbowPos = s.clone().addScaledVector(dir, along).addScaledVector(bendDir, out);
  const wrist = s.clone().addScaledVector(dir, d);

  const u = elbowPos.clone().sub(s).normalize();
  const f = wrist.clone().sub(elbowPos).normalize();
  const y = u.clone().negate();
  let w = f.clone().addScaledVector(u, -f.dot(u));
  if (w.lengthSq() < 1e-8) w = bendDir.clone();
  const z = w.normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y);
  shoulder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  elbow.rotation.set(Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1)), 0, 0);
}

