import * as THREE from 'three';
import { DEFAULT_LOOK, type CharacterLook, type NavGrid, type PropDef, type Vec3 } from '@gungame/shared';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import { CharacterAvatar } from '../entities/character/CharacterAvatar';
import type { CivilianStyle } from '../entities/character/soldierOutfit';

type CharacterProp = Extract<PropDef, { kind: 'character' }>;

export interface StoryLook {
  name: string;
  look: Partial<CharacterLook>;
  outfit: CivilianStyle;
  height?: number;
}

/**
 * A named character the story turns on (someone you talk to, or the target): a full character
 * model standing or sitting where the map puts them, turning their head to whoever they're
 * talking to. They can be shot (a hit volume the mission's bullets know about).
 */
export class StoryNPC {
  readonly id: string;
  readonly name: string;
  readonly avatar: CharacterAvatar | null;
  readonly pos: THREE.Vector3;
  yaw: number;
  hp = 100;
  /** Who they're looking at (null: ahead). */
  lookAt: THREE.Vector3 | null = null;
  readonly hitbox: THREE.Mesh;
  private down = 0;
  /** Seat height above their feet while sitting (undefined: standing). */
  seat: number | undefined;
  /** Walking somewhere: the path, and how fast they're going. */
  private path: Vec3[] = [];
  private pathIndex = 0;
  private speed = 0;
  /** Off the deck and falling (pushed overboard): vertical speed. */
  private fallSpeed: number | null = null;

  constructor(prop: CharacterProp, style: StoryLook, root: THREE.Object3D) {
    this.id = prop.id;
    this.name = style.name;
    this.pos = new THREE.Vector3(prop.x, prop.y, prop.z);
    this.yaw = prop.yaw;
    this.seat = prop.seat;
    const gltf = getModel(MODEL_FILES.player);
    this.avatar = gltf ? new CharacterAvatar(gltf, { ...DEFAULT_LOOK, headgear: 'none', vest: 'none', gloves: 'none', ...style.look }, {
      npc: true, civ: style.outfit, height: style.height ?? 1.78,
    }) : null;
    this.avatar?.clearWeapon();
    if (this.avatar) root.add(this.avatar.group);
    this.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.7, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.userData.storyNpc = this;
    this.hitbox.visible = false;
    root.add(this.hitbox);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Where their head is (for voices and looks). */
  get head(): THREE.Vector3 {
    return this.pos.clone().add(new THREE.Vector3(0, this.seat !== undefined && this.alive ? 1.25 : 1.62, 0));
  }

  hurt(amount: number): void {
    this.hp -= amount;
  }

  /** Walks there (standing up first). False if there's no way. */
  goTo(to: Vec3, nav: NavGrid): boolean {
    const path = nav.findPath(this.pos, to, 80000);
    if (!path) return false;
    this.seat = undefined;
    this.path = path;
    this.pathIndex = path.length > 1 ? 1 : 0;
    return true;
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  /** Pushed over a rail: they go over and fall to the sea. */
  fall(away: THREE.Vector3): void {
    this.path = [];
    this.seat = undefined;
    this.fallSpeed = 0;
    this.pos.addScaledVector(away, 1.2);
    this.hp = 0;
  }

  update(dt: number): void {
    if (this.fallSpeed !== null) {
      this.fallSpeed += 14 * dt;
      this.pos.y -= this.fallSpeed * dt;
    } else if (this.path.length && this.alive) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, 1.35 * dt);
      if (d > 0.01) {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        let dy = Math.atan2(-dx, -dz) - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * (1 - Math.exp(-8 * dt));
      }
      this.pos.y += (wp.y - this.pos.y) * Math.min(1, dt * 8);
      this.speed = 1.35;
      if (d < 0.2) {
        if (this.pathIndex < this.path.length - 1) this.pathIndex++;
        else { this.path = []; this.speed = 0; }
      }
    } else this.speed = 0;
    if (!this.alive) this.down = Math.min(1, this.down + dt * 1.6);
    const seated = this.seat !== undefined && this.alive;
    this.avatar?.update(dt, {
      pos: this.pos, yaw: this.yaw, pitch: 0, stance: 'stand', eyeHeight: 1.6, speed: this.speed, forward: this.speed,
      swimming: false, onGround: true, aiming: false, gunOffset: new THREE.Vector3(), gunRotation: new THREE.Quaternion(),
      seat: seated ? { seat: this.pos.y + this.seat!, floor: this.pos.y, lean: 0.15, blend: 1 } : undefined,
      down: this.down,
      lookAt: this.alive && this.lookAt ? this.lookAt : undefined,
    });
    this.hitbox.position.set(this.pos.x, this.pos.y + (seated ? 0.7 : this.alive ? 0.85 : 0.2), this.pos.z);
  }

  dispose(): void {
    this.avatar?.group.removeFromParent();
    this.hitbox.removeFromParent();
    this.hitbox.geometry.dispose();
  }
}
