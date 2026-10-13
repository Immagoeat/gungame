import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_MAX_HP, PLAYER_RADIUS, STANCES, type Mover, type Stance, type Vec3 } from '@gungame/shared';

/** Seconds of breath underwater before drowning starts. */
export const BREATH_SECONDS = 20;

export class Player implements Mover {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly radius = PLAYER_RADIUS;
  height = PLAYER_HEIGHT;
  readonly canStep = true;
  stepHeight?: number;
  onGround = true;
  stance: Stance = 'stand';
  swimming = false;
  submerged = 0;
  waterLevel = -Infinity;
  /** Walking speed multiplier (1 normally; slower when dragging a body). */
  speedMul = 1;
  /** Camera height above the feet; eases towards the stance's eye height. */
  eyeHeight = STANCES.stand.eye;
  /** 0..1 breath left while underwater. */
  breath = 1;

  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  /** Match time of the last damage taken; drives regen delay. */
  lastHurt = -Infinity;
  yaw = 0;
  pitch = 0;
  /** Temporary aim kick from recoil, decays back to zero. */
  recoilPitch = 0;

  reset(spawn: Vec3, yaw = 0): void {
    this.speedMul = 1;
    this.pos.set(spawn.x, spawn.y, spawn.z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.lastHurt = -Infinity;
    this.yaw = yaw;
    this.pitch = this.recoilPitch = 0;
    this.stance = 'stand';
    this.height = PLAYER_HEIGHT;
    this.eyeHeight = STANCES.stand.eye;
    this.swimming = false;
    this.submerged = 0;
    this.waterLevel = -Infinity;
    this.breath = 1;
  }

  eye(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** Eyes below the water surface. */
  get headUnderwater(): boolean {
    return this.pos.y + this.eyeHeight < this.waterLevel - 0.02;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
