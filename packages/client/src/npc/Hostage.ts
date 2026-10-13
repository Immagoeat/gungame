import * as THREE from 'three';
import { DEFAULT_LOOK, moveAndCollide, type AABB, type Body, type PropDef, type Vec3 } from '@gungame/shared';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import { CharacterAvatar } from '../entities/character/CharacterAvatar';
import type { NavGrid } from '@gungame/shared';
import type { OtherTarget } from './GuardManager';

type HostageProp = Extract<PropDef, { kind: 'hostage' }>;

/**
 * The hostage (Daniel Reyes): tied to a chair until freed, then follows you, keeping a couple of
 * meters back, running to catch up, and ducking down when there's shooting. Guards will shoot him.
 */
export class Hostage implements Body, OtherTarget {
  readonly avatar: CharacterAvatar | null;
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  readonly radius = 0.3;
  readonly height = 1.75;
  onGround = true;
  readonly canStep = true;
  yaw: number;
  hp = 160;
  freed = false;
  /** Seconds since shooting nearby: he keeps his head down. */
  scared = 0;
  private path: Vec3[] = [];
  private pathIndex = 0;
  private repath = 0;
  private speed = 0;
  private crouch = 0;
  readonly hitbox: THREE.Mesh;

  constructor(private readonly prop: HostageProp, root: THREE.Object3D) {
    this.pos = { x: prop.x, y: prop.y, z: prop.z };
    this.yaw = prop.yaw;
    const gltf = getModel(MODEL_FILES.player);
    this.avatar = gltf ? new CharacterAvatar(gltf, { ...DEFAULT_LOOK, skin: 'tan', hair: 'black', face: 'stubble', headgear: 'none', vest: 'none', gloves: 'none' }, {
      npc: true, height: 1.76,
      civ: { top: 'shirt', topColor: 0xd8d4cc, bottomColor: 0x2c2f36, shoes: 0x1a1210, hairStyle: 'short' },
    }) : null;
    this.avatar?.clearWeapon();
    if (this.avatar) root.add(this.avatar.group);
    this.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.7, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.userData.hostage = this;
    this.hitbox.visible = false;
    root.add(this.hitbox);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
  }

  hurt(amount: number): void {
    this.hp -= amount;
    this.scared = 6;
  }

  free(nav?: NavGrid): void {
    this.freed = true;
    // Up out of the chair onto clear floor in front of it.
    const ahead = { x: this.pos.x - Math.sin(this.yaw) * 0.9, y: this.pos.y, z: this.pos.z - Math.cos(this.yaw) * 0.9 };
    const n = nav ? nav.nearest(ahead, 1.5) : -1;
    const at = n >= 0 ? nav!.point(n) : ahead;
    this.pos.x = at.x;
    this.pos.y = at.y;
    this.pos.z = at.z;
  }

  update(dt: number, player: THREE.Vector3, nav: NavGrid, colliders: readonly AABB[], danger: boolean): void {
    if (danger) this.scared = Math.max(this.scared, 3);
    this.scared = Math.max(0, this.scared - dt);
    let moving = false;
    if (this.freed && this.alive) {
      const me = this.position;
      const d = me.distanceTo(player);
      // Follow: keep about 2.2 m behind; catch up fast if left behind.
      if (d > 2.6) {
        this.repath -= dt;
        if (this.repath <= 0 || !this.path.length) {
          this.path = nav.findPath(this.pos, player) ?? [];
          this.pathIndex = this.path.length > 1 ? 1 : 0;
          this.repath = 0.8;
        }
        const wp = this.path[this.pathIndex];
        if (wp) {
          const dx = wp.x - this.pos.x;
          const dz = wp.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.35 && this.pathIndex < this.path.length - 1) this.pathIndex++;
          const speed = (d > 6 ? 4.6 : 2.4) * (this.scared > 0 ? 0.75 : 1);
          if (dist > 0.05) {
            const k = 1 - Math.exp(-10 * dt);
            this.vel.x += (dx / dist * speed - this.vel.x) * k;
            this.vel.z += (dz / dist * speed - this.vel.z) * k;
            moving = true;
          }
        }
      }
      if (!moving) {
        const k = 1 - Math.exp(-10 * dt);
        this.vel.x -= this.vel.x * k;
        this.vel.z -= this.vel.z * k;
      }
      this.vel.y -= 25 * dt;
      moveAndCollide(this, colliders, dt);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      const face = this.speed > 0.4 ? Math.atan2(-this.vel.x, -this.vel.z) : Math.atan2(-(player.x - this.pos.x), -(player.z - this.pos.z));
      let dy = face - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-6 * dt));
    }
    // Ducks when scared and stopped.
    this.crouch += ((this.scared > 0 && this.speed < 1 ? 1 : this.scared > 0 ? 0.4 : 0) - this.crouch) * (1 - Math.exp(-6 * dt));
    const p = this.position;
    if (this.avatar) {
      this.avatar.update(dt, {
        pos: p, yaw: this.yaw, pitch: 0, stance: 'stand', eyeHeight: 1.6 - this.crouch * 0.6, speed: this.speed, forward: this.speed,
        swimming: false, onGround: true, aiming: false, gunOffset: new THREE.Vector3(), gunRotation: new THREE.Quaternion(),
        seat: this.freed ? undefined : { seat: this.prop.y + this.prop.seat, floor: this.prop.y, lean: 0.25, blend: 1 },
        restrained: !this.freed,
        down: this.alive ? 0 : 1,
        lookAt: !this.freed ? undefined : player.clone().add(new THREE.Vector3(0, 1.5, 0)),
      });
    }
    this.hitbox.position.set(p.x, p.y + (this.freed ? 0.85 - this.crouch * 0.3 : 0.7), p.z);
  }

  dispose(): void {
    this.avatar?.group.removeFromParent();
    this.hitbox.removeFromParent();
  }
}
