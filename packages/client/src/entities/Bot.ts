import * as THREE from 'three';
import type { Body } from '@gungame/shared';

const bodyGeo = new THREE.CylinderGeometry(0.34, 0.38, 1.1, 12);
const headGeo = new THREE.SphereGeometry(0.22, 14, 10);
const visorGeo = new THREE.BoxGeometry(0.3, 0.08, 0.1);
const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.55);
const legGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);
const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

/** Muzzle position in the bot's local space (bot faces +z). */
export const BOT_MUZZLE = new THREE.Vector3(0.28, 1.3, 0.65);
export const BOT_EYE_HEIGHT = 1.9;

/** A single AI soldier: physics body, mesh and AI state. Behavior lives in BotManager. */
export class Bot implements Body {
  readonly pos: THREE.Vector3;
  readonly vel = new THREE.Vector3();
  readonly radius = 0.4;
  readonly height = 2.1;
  onGround = true;

  readonly group = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly torso: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly tintMats: THREE.MeshStandardMaterial[];

  hp = 100;
  dead = false;
  deathTime = 0;
  hitFlash = 0;
  speed = 3 + Math.random() * 1.2;

  // AI state
  canSeePlayer = false;
  losTimer = 0;
  fireCooldown = 1.5 + Math.random();
  strafeDir = Math.random() < 0.5 ? 1 : -1;
  strafeTimer = 1;
  /** Temporary override direction used to get unstuck or to patrol. */
  wander: { x: number; z: number } | null = null;
  wanderTimer = 0;
  private walkPhase = 0;

  constructor(spawn: THREE.Vector3, readonly name: string) {
    this.pos = spawn.clone();
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.55, 0.42), roughness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.7 });
    this.tintMats = [bodyMat, headMat];

    this.torso = new THREE.Mesh(bodyGeo, bodyMat);
    this.torso.position.y = 1.15;
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.92;
    const visor = new THREE.Mesh(visorGeo, darkMat);
    visor.position.set(0, 1.95, 0.17);
    this.legL = new THREE.Mesh(legGeo, darkMat);
    this.legL.position.set(-0.14, 0.3, 0);
    this.legR = new THREE.Mesh(legGeo, darkMat);
    this.legR.position.set(0.14, 0.3, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.28, 1.3, 0.35);
    for (const m of [this.torso, this.head, visor, this.legL, this.legR, gun]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.torso.userData.bot = this.head.userData.bot = this;
    this.head.userData.head = true;
    this.group.position.copy(this.pos);
  }

  /** Meshes that bullets can hit. */
  get hitboxes(): THREE.Mesh[] {
    return [this.torso, this.head];
  }

  flash(): void {
    this.hitFlash = 0.12;
  }

  syncVisuals(dt: number, facing: number): void {
    this.group.position.copy(this.pos);
    this.group.rotation.y = facing;
    this.walkPhase += dt * this.speed * 2.5;
    this.legL.rotation.x = Math.sin(this.walkPhase) * 0.6;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * 0.6;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const v = Math.max(0, this.hitFlash) * 6;
      for (const m of this.tintMats) m.emissive.setRGB(v, v * 0.3, v * 0.3);
    }
  }

  /** Death animation. Returns true once the body should be removed. */
  animateDeath(dt: number): boolean {
    this.deathTime += dt;
    this.group.rotation.x = -Math.min(1, this.deathTime / 0.45) * Math.PI / 2;
    if (this.deathTime > 2.5) this.group.position.y -= dt * 0.8;
    return this.deathTime > 3.5;
  }

  die(): void {
    this.dead = true;
    for (const m of this.tintMats) m.emissive.setRGB(0, 0, 0);
  }
}
