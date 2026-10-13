import * as THREE from 'three';
import { DEFAULT_LOOK, moveAndCollide, WEAPONS, type AABB, type Body, type CharacterLook, type PropDef, type Vec3, type WeaponId } from '@gungame/shared';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import type { AvatarState } from '../entities/avatar';
import { CharacterAvatar } from '../entities/character/CharacterAvatar';
import type { CivilianStyle } from '../entities/character/soldierOutfit';

export type GuardDef = Extract<PropDef, { kind: 'guard' }>;

/**
 * - patrol / post: going about their rounds
 * - investigate: something odd (a glimpse, a noise): walk over and look
 * - search: lost track of you; checking around the last place you were
 * - combat: they know where you are
 * - down / dead: knocked out or killed (a body others can find)
 */
export type GuardState = 'patrol' | 'post' | 'investigate' | 'search' | 'combat' | 'down' | 'dead';

/** How each weapon is used by a guard: time between shots, shots per burst, damage per hit, effective range. */
export const GUARD_GUNS: Record<WeaponId, { interval: number; burst: number; pause: number; damage: number; range: number; spread: number }> = {
  pistol: { interval: 0.42, burst: 2, pause: 0.9, damage: 9, range: 30, spread: 1 },
  smg: { interval: 0.09, burst: 5, pause: 1.1, damage: 6, range: 26, spread: 1.4 },
  rifle: { interval: 0.13, burst: 3, pause: 1.0, damage: 11, range: 50, spread: 0.9 },
  shotgun: { interval: 0.95, burst: 1, pause: 0.5, damage: 34, range: 14, spread: 1.6 },
  sniper: { interval: 2.4, burst: 1, pause: 0.6, damage: 42, range: 90, spread: 0.4 },
  golden: { interval: 0.6, burst: 1, pause: 0.6, damage: 50, range: 30, spread: 1 },
};

const SUIT: CivilianStyle = { top: 'blazer', topColor: 0x111214, bottomColor: 0x111214, accent: 0xf2f2f0, shoes: 0x0d0d0e, hairStyle: 'short' };
const CHIEF: CivilianStyle = { top: 'blazer', topColor: 0x3a3d44, bottomColor: 0x23252a, accent: 0x0e0f12, shoes: 0x1a1210, hairStyle: 'buzz' };
const TACTICAL_LOOK: CharacterLook = { ...DEFAULT_LOOK, camo: 'black', headgear: 'helmet', vest: 'plate', gloves: 'black', boots: 'black', face: 'stubble' };

export const GUARD_WALK = 1.45;
export const GUARD_JOG = 2.9;
export const GUARD_RUN = 4.6;

/** A security guard: body, physics and the state the AI (GuardManager) works on. */
export class Guard implements Body {
  readonly id: string;
  readonly def: GuardDef;
  readonly name: string | null;
  readonly avatar: CharacterAvatar | null;
  // Physics body.
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  readonly radius = 0.32;
  readonly height = 1.8;
  onGround = true;
  readonly canStep = true;

  yaw: number;
  /** Where the head is turned, relative to the body (looking around at a post). */
  headTurn = 0;
  aimPitch = 0;
  state: GuardState;
  hp: number;
  /** 0..1: how sure they are they've seen you. */
  awareness = 0;
  /** Extra alertness after an alarm (sees faster, searches longer). */
  wary = 0;
  /** Where they're going (investigation spot, last known position...). */
  goal: THREE.Vector3 | null = null;
  path: Vec3[] = [];
  pathIndex = 0;
  repath = 0;
  routeIndex = 0;
  wait = 0;
  /** Timers: until they give up searching, until they can shoot, between bursts. */
  searchTime = 0;
  reaction = 0;
  fireTimer = 0;
  burstLeft = 0;
  /** Last place they saw (or were told) you were, and how long ago. */
  lastKnown = new THREE.Vector3();
  sinceSeen = Infinity;
  canSee = false;
  /** Collapse animation 0..1. */
  downAnim = 0;
  /** Things they carry for the mission (searched from the body). */
  carries: string | null;
  searched = false;
  /** Seated at a desk. */
  seated: boolean;
  /** A body has been found (so it doesn't raise the alarm twice). */
  discovered = false;
  readonly weapon: WeaponId;
  speed = 0;
  /** Spawned as reinforcement (not part of the original team). */
  reinforcement = false;
  stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  strafeTimer = 0;
  /** Seconds since they last heard / were told something, for barks. */
  barkCooldown = 0;
  readonly hitboxes: THREE.Mesh[] = [];
  /** Time since the body was last posed (far guards pose less often). */
  bodyDt = 0;

  constructor(def: GuardDef, root: THREE.Object3D) {
    this.id = def.id;
    this.def = def;
    this.name = def.name ?? null;
    this.pos = { x: def.x, y: def.y, z: def.z };
    this.lastPos.set(def.x, def.y, def.z);
    this.yaw = def.yaw;
    this.weapon = def.weapon;
    this.carries = def.carries ?? null;
    this.seated = !!def.seated;
    this.state = def.route?.length ? 'patrol' : 'post';
    const look = def.look ?? 'suit';
    this.hp = look === 'tactical' ? 160 : look === 'chief' ? 150 : 100;
    const gltf = getModel(MODEL_FILES.player);
    let avatar: CharacterAvatar | null = null;
    if (gltf) {
      let seed = 0;
      for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const pick = <T,>(a: readonly T[]) => a[seed++ % a.length];
      const skin = pick(['light', 'fair', 'medium', 'tan', 'brown', 'dark']);
      const civ = look === 'tactical' ? undefined : look === 'chief' ? CHIEF : SUIT;
      const lookDef: CharacterLook = look === 'tactical' ? { ...TACTICAL_LOOK, skin }
        : { ...DEFAULT_LOOK, skin, hair: pick(['black', 'brown', 'grey', 'blond']), face: pick(['clean', 'stubble', 'beard', 'clean']), headgear: 'none', vest: 'none', gloves: 'none' };
      avatar = new CharacterAvatar(gltf, lookDef, { npc: true, civ, height: 1.8 + (seed % 5) * 0.02 });
      avatar.setWeapon(def.weapon, {});
      root.add(avatar.group);
    }
    this.avatar = avatar;
    // Hit volumes: head and body (positioned every frame).
    const hit = new THREE.MeshBasicMaterial({ visible: false });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), hit);
    head.userData.head = true;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 1.45, 8), hit);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.85, 8), hit);
    // Hidden (the renderer skips them; bullets' raycasts still hit them).
    for (const m of [head, torso, legs]) { m.userData.guard = this; m.visible = false; root.add(m); this.hitboxes.push(m); }
  }

  get alive(): boolean {
    return this.state !== 'down' && this.state !== 'dead';
  }

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.seated ? 1.15 : 1.62), this.pos.z);
  }

  /** Facing (body yaw plus where the head is turned), as a horizontal unit vector. */
  get facing(): THREE.Vector3 {
    const a = this.yaw + this.headTurn;
    return new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
  }

  get gun() {
    return GUARD_GUNS[this.weapon];
  }

  get muzzleVelocity(): number {
    return WEAPONS[this.weapon].muzzleVelocity;
  }

  setGoal(p: THREE.Vector3 | Vec3, nav: { findPath(a: Vec3, b: Vec3): Vec3[] | null }): boolean {
    this.goal = new THREE.Vector3(p.x, p.y, p.z);
    const path = nav.findPath(this.pos, this.goal);
    this.path = path ?? [];
    this.pathIndex = this.path.length > 1 ? 1 : 0;
    this.repath = 2.5;
    return !!path;
  }

  /** Walks along the current path at `speed`; returns true on arrival (or with nowhere to go). */
  follow(dt: number, speed: number, colliders: readonly AABB[]): boolean {
    let arrived = this.path.length === 0;
    let dirX = 0;
    let dirZ = 0;
    if (!arrived) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35 && Math.abs(wp.y - this.pos.y) < 1.2) {
        if (this.pathIndex < this.path.length - 1) this.pathIndex++;
        else arrived = true;
      } else {
        dirX = dx / d;
        dirZ = dz / d;
      }
    }
    const target = arrived ? 0 : speed;
    const accel = 1 - Math.exp(-10 * dt);
    this.vel.x += (dirX * target - this.vel.x) * accel;
    this.vel.z += (dirZ * target - this.vel.z) * accel;
    this.vel.y -= 25 * dt;
    moveAndCollide(this, colliders, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.3) this.turnTo(Math.atan2(-this.vel.x, -this.vel.z), dt, 7);
    // Stuck (walking into something the grid didn't know about): skip ahead or give up.
    const moved = this.lastPos.distanceTo(this.pos as THREE.Vector3);
    this.lastPos.set(this.pos.x, this.pos.y, this.pos.z);
    if (!arrived && target > 0 && moved < target * dt * 0.25) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.stuckTimer = 0;
        if (this.pathIndex < this.path.length - 1) this.pathIndex++;
        else arrived = true;
      }
    } else this.stuckTimer = 0;
    return arrived;
  }

  /** Stands still (bleeds off velocity, keeps gravity). */
  hold(dt: number, colliders: readonly AABB[]): void {
    if (this.seated) {
      // Sitting in a chair: stay put (the chair's collider would push them out).
      this.vel = { x: 0, y: 0, z: 0 };
      this.speed = 0;
      return;
    }
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x -= this.vel.x * k;
    this.vel.z -= this.vel.z * k;
    this.vel.y -= 25 * dt;
    moveAndCollide(this, colliders, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
  }

  turnTo(yaw: number, dt: number, rate = 5): void {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  /** Poses the body and moves the hit volumes. */
  updateBody(dt: number, aiming: boolean): void {
    const p = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    if (!this.alive) this.downAnim = Math.min(1, this.downAnim + dt * 1.6);
    if (this.avatar) {
      const pistol = this.weapon === 'pistol' || this.weapon === 'golden';
      const state: AvatarState = {
        pos: p, yaw: this.yaw, pitch: this.aimPitch, stance: 'stand', eyeHeight: 1.6,
        speed: this.speed, forward: this.speed, swimming: false, onGround: true, aiming,
        gunOffset: pistol ? new THREE.Vector3(0.05, -0.12, -0.42) : new THREE.Vector3(0.12, -0.17, -0.3),
        gunRotation: new THREE.Quaternion(),
        hold: aiming ? undefined : { kind: 'lowReady', blend: 1 },
        down: this.downAnim,
        seat: this.seated && this.alive ? { seat: this.pos.y + 0.48, floor: this.pos.y, lean: 0.2, blend: 1 } : undefined,
        lookAt: this.alive && !aiming ? p.clone().add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(this.facing, 4) : undefined,
      };
      this.avatar.update(dt, state);
    }
    // Hit volumes follow the body (lying flat once down).
    const [head, torso, legs] = this.hitboxes;
    if (this.alive) {
      const h = this.seated ? 1.25 : 1.68;
      head.position.set(p.x, p.y + h, p.z);
      torso.position.set(p.x, p.y + (this.seated ? 0.85 : 1.15), p.z);
      torso.scale.set(1, this.seated ? 0.65 : 1, 1);
      torso.quaternion.identity();
      legs.position.set(p.x, p.y + 0.45, p.z);
      legs.scale.y = this.seated ? 0.01 : 1;
    } else {
      const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      head.position.copy(p).addScaledVector(back, 1.6).setY(p.y + 0.15);
      torso.position.copy(p).addScaledVector(back, 0.95).setY(p.y + 0.18);
      torso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
      legs.position.copy(p).addScaledVector(back, 0.35).setY(p.y + 0.12);
    }
  }

  dispose(): void {
    this.avatar?.group.removeFromParent();
    for (const m of this.hitboxes) { m.removeFromParent(); m.geometry.dispose(); }
  }
}
