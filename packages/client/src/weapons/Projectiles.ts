import * as THREE from 'three';
import {
  BULLET_DRAG, BULLET_GRAVITY, damageScale, exitSpeed, FLESH_RESISTANCE, FLESH_THICKNESS, MIN_BULLET_SPEED,
  PENETRATION_RESISTANCE, raycastBoxes, ricochetChance,
  type AABB, type BlockMaterial, type BoxHit, type WeaponDef,
} from '@gungame/shared';
import type { Game } from '../core/Game';
import type { Bot } from '../entities/Bot';
import type { ImpactKind } from '../fx/Effects';

interface Bullet {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  weapon: WeaponDef;
  age: number;
  traveled: number;
  /** Where the visible streak starts (the muzzle), so it never trails back into the player. */
  origin: THREE.Vector3;
  /** Bots/cameras/lights already hit, so a bullet only hits each once. */
  hit: Set<object>;
}

type Event =
  | { kind: 'box'; t: number; box: AABB; hit: BoxHit }
  | { kind: 'object'; t: number; object: THREE.Object3D; point: THREE.Vector3 }
  | { kind: 'ground'; t: number };

const MAX_BULLETS = 256;
const MAX_RANGE = 700;
const MAX_AGE = 3;
const STREAK_SECONDS = 0.03;
const EPS = 0.003;

const IMPACT: Partial<Record<BlockMaterial, ImpactKind>> = {
  plaster: 'plaster', ceiling: 'plaster', trim: 'plaster',
  metal: 'metal', steel: 'metal', gold: 'metal', ironGate: 'metal', windowFrame: 'metal', carPaint: 'metal', serverRack: 'metal', screen: 'metal',
  wood: 'wood', darkWood: 'wood', crate: 'wood', crateLight: 'wood', crateGreen: 'wood', books: 'wood', palmTrunk: 'wood',
  fabric: 'soft', leather: 'soft', carpet: 'soft', painting: 'soft', rubber: 'soft',
  grass: 'foliage', hedge: 'foliage',
};

/**
 * Bullets as real projectiles: they travel at muzzle velocity, slow with drag, drop with gravity,
 * and punch through materials according to the shared penetration model, leaving entry and exit
 * holes. Damage scales with the speed they have left when they arrive.
 */
export class Projectiles {
  private readonly bullets: Bullet[] = [];
  private readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_BULLETS * 6);
  private readonly colors = new Float32Array(MAX_BULLETS * 6);
  private readonly ray = new THREE.Raycaster();

  constructor(private readonly game: Game) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    game.gfx.scene.add(this.lines);
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, weapon: WeaponDef, muzzle: THREE.Vector3): void {
    if (this.bullets.length >= MAX_BULLETS) this.bullets.shift();
    this.bullets.push({
      pos: origin.clone(), dir: dir.clone().normalize(), speed: weapon.muzzleVelocity, weapon,
      age: 0, traveled: 0, origin: muzzle.clone(), hit: new Set(),
    });
  }

  clear(): void {
    this.bullets.length = 0;
    this.lines.geometry.setDrawRange(0, 0);
  }

  update(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!this.step(b, dt)) this.bullets.splice(i, 1);
    }
    this.draw();
  }

  /** Advances one bullet. Returns false once it has stopped. */
  private step(b: Bullet, dt: number): boolean {
    b.age += dt;
    const vel = b.dir.clone().multiplyScalar(b.speed * (1 - BULLET_DRAG * dt));
    vel.y -= BULLET_GRAVITY * dt;
    b.speed = vel.length();
    b.dir.copy(vel).divideScalar(b.speed);
    let remaining = b.speed * dt;
    b.traveled += remaining;

    // Water: a splash where the bullet breaks the surface, then it loses speed very quickly.
    let underwater = 0;
    for (const w of raycastBoxes(b.pos, b.dir, remaining, this.game.world.water)) {
      const box = this.game.world.water[w.box];
      if (w.tIn > 0 && w.normalIn.y > 0.5) {
        const at = b.pos.clone().addScaledVector(b.dir, w.tIn);
        this.game.waterFx.splash(at, box.max.y, 0.08);
        this.game.audio.splash(0.05);
      }
      underwater += Math.max(0, Math.min(remaining, w.tOut) - w.tIn);
    }
    if (underwater > 0) {
      const slowed = exitSpeed(b.speed, PENETRATION_RESISTANCE.water, underwater);
      if (slowed <= 0) {
        // Spent in the water: travel only as far as it gets, then stop.
        remaining = Math.min(remaining, (b.speed - MIN_BULLET_SPEED) / (PENETRATION_RESISTANCE.water * 100) + 0.01);
        b.speed = MIN_BULLET_SPEED + 1;
        b.age = MAX_AGE;
      } else {
        b.speed = slowed;
      }
    }
    for (let iter = 0; iter < 12 && remaining > 1e-4; iter++) {
      const ev = this.nextEvent(b, remaining);
      if (!ev) {
        b.pos.addScaledVector(b.dir, remaining);
        break;
      }
      b.pos.addScaledVector(b.dir, ev.t);
      remaining -= ev.t;
      if (!this.resolve(b, ev)) return false;
    }
    return b.speed > MIN_BULLET_SPEED && b.age < MAX_AGE && b.traveled < MAX_RANGE;
  }

  private nextEvent(b: Bullet, maxT: number): Event | null {
    const world = this.game.world;
    let best: Event | null = null;
    const boxHit = raycastBoxes(b.pos, b.dir, maxT, world.colliders)[0];
    if (boxHit) best = { kind: 'box', t: boxHit.tIn, box: world.colliders[boxHit.box], hit: boxHit };

    this.ray.set(b.pos, b.dir);
    this.ray.far = best ? best.t + 0.01 : maxT;
    const targets = [...this.game.bots.hitTargets(), ...world.security.hitTargets(), ...world.lights.hitTargets(), ...(this.game.actors?.hitTargets() ?? [])];
    for (const h of this.ray.intersectObjects(targets, false)) {
      const owner = h.object.userData.bot ?? h.object.userData.securityCam ?? h.object.userData.lightFixture ?? h.object.userData.guard ?? h.object.userData.hostage;
      if (b.hit.has(owner)) continue;
      if (!best || h.distance < best.t) best = { kind: 'object', t: h.distance, object: h.object, point: h.point };
      break;
    }

    if (b.dir.y < 0 && b.pos.y > 0) {
      const t = b.pos.y / -b.dir.y;
      if (t <= maxT && (!best || t < best.t)) best = { kind: 'ground', t };
    }
    return best;
  }

  /** Applies a hit at b.pos. Returns false if the bullet stops here. */
  private resolve(b: Bullet, ev: Event): boolean {
    const g = this.game;
    if (ev.kind === 'ground') {
      g.fx.bulletHole(b.pos, new THREE.Vector3(0, 1, 0));
      g.fx.impact(b.pos, new THREE.Vector3(0, 1, 0), 'masonry');
      return false;
    }

    if (ev.kind === 'object') {
      const ud = ev.object.userData;
      if (ud.bot) {
        const bot = ud.bot as Bot;
        b.hit.add(bot);
        const head = ud.head === true;
        const dmg = b.weapon.damage * damageScale(b.speed, b.weapon.muzzleVelocity) * (head ? b.weapon.headshotMultiplier : 1);
        const killed = g.bots.damage(bot, dmg, head);
        g.hud.hitmarker(killed);
        g.audio.beep(killed ? 1400 : 1900, 0.05, 'triangle', 0.08);
        g.fx.impact(ev.point, b.dir.clone().negate(), 'flesh', head ? 8 : 5);
        b.speed = exitSpeed(b.speed, FLESH_RESISTANCE, head ? 0.18 : FLESH_THICKNESS);
        b.pos.addScaledVector(b.dir, head ? 0.25 : 0.45);
        return b.speed > 0;
      }
      if ((ud.guard || ud.hostage) && g.actors) {
        const who = ud.guard ?? ud.hostage;
        b.hit.add(who);
        const head = ud.head === true;
        const dmg = b.weapon.damage * damageScale(b.speed, b.weapon.muzzleVelocity) * (head ? b.weapon.headshotMultiplier : 1);
        const from = b.origin.clone();
        const killed = g.actors.hit(ev.object, dmg, head, from);
        if (ud.guard) {
          g.hud.hitmarker(killed);
          g.audio.beep(killed ? 1400 : 1900, 0.05, 'triangle', 0.08);
        }
        g.fx.impact(ev.point, b.dir.clone().negate(), 'flesh', head ? 8 : 5);
        b.speed = exitSpeed(b.speed, FLESH_RESISTANCE, head ? 0.18 : FLESH_THICKNESS);
        b.pos.addScaledVector(b.dir, head ? 0.25 : 0.45);
        return b.speed > 0;
      }
      if (ud.securityCam) {
        b.hit.add(ud.securityCam);
        g.destroyCamera(ud.securityCam, ev.point, b.dir);
        g.hud.hitmarker(true);
        b.speed *= 0.6;
        b.pos.addScaledVector(b.dir, 0.05);
        return true;
      }
      if (ud.lightFixture) {
        b.hit.add(ud.lightFixture);
        g.shootLight(ud.lightFixture, ev.point, b.dir);
        b.speed *= 0.85;
        b.pos.addScaledVector(b.dir, 0.05);
        return true;
      }
      b.pos.addScaledVector(b.dir, 0.01);
      return true;
    }

    // A solid block: glass, a wall layer, furniture... or a party guest.
    if (g.world.party.isGuestBox(ev.box)) g.actors?.civilianHit(b.pos.clone());
    const info = g.world.colliderInfo.get(ev.box);
    if (info && !info.invisible) g.actors?.noise(b.pos, 3, 'impact');
    const thickness = Math.max(0.005, ev.hit.tOut - ev.hit.tIn);
    const pane = g.world.glass.byBox.get(ev.box);
    if (pane) {
      g.breakGlass(pane, b.pos, b.dir);
      b.speed = exitSpeed(b.speed, PENETRATION_RESISTANCE.glass, thickness);
      b.pos.addScaledVector(b.dir, thickness + EPS);
      return b.speed > 0;
    }
    const resistance = info?.resistance ?? 30;
    const kind: ImpactKind = info ? IMPACT[info.material] ?? (info.invisible ? 'soft' : 'masonry') : 'masonry';
    const nIn = new THREE.Vector3(ev.hit.normalIn.x, ev.hit.normalIn.y, ev.hit.normalIn.z);
    const visible = info ? !info.invisible : true;

    if (Math.random() < ricochetChance(Math.abs(b.dir.dot(nIn)), resistance)) {
      b.dir.addScaledVector(nIn, -2 * b.dir.dot(nIn));
      b.dir.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.08)).normalize();
      b.speed *= 0.55;
      b.pos.addScaledVector(nIn, EPS * 2);
      g.fx.impact(b.pos, nIn, 'metal', 6);
      g.audio.ricochet();
      return b.speed > MIN_BULLET_SPEED;
    }

    if (visible) g.fx.bulletHole(b.pos, nIn);
    g.fx.impact(b.pos, nIn, kind);
    const out = exitSpeed(b.speed, resistance, thickness);
    if (out <= 0) return false;

    // Through: exit hole on the far side, a puff of debris, a little deflection.
    const exit = b.pos.clone().addScaledVector(b.dir, thickness);
    const nOut = new THREE.Vector3(ev.hit.normalOut.x, ev.hit.normalOut.y, ev.hit.normalOut.z);
    if (visible && thickness < 2) g.fx.bulletHole(exit, nOut, 1.3);
    g.fx.impact(exit, b.dir, kind, 3);
    const deflect = 0.01 + thickness * 0.06;
    b.dir.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(deflect)).normalize();
    b.speed = out;
    b.pos.copy(exit).addScaledVector(b.dir, EPS);
    return true;
  }

  private draw(): void {
    let n = 0;
    for (const b of this.bullets) {
      const len = Math.min(b.speed * STREAK_SECONDS, b.pos.distanceTo(b.origin), 6);
      if (len < 0.05) continue;
      const tail = b.pos.clone().addScaledVector(b.dir, -len);
      const heat = Math.min(1, b.speed / 700);
      this.positions.set([tail.x, tail.y, tail.z, b.pos.x, b.pos.y, b.pos.z], n * 6);
      this.colors.set([0.15, 0.1, 0.05, 1, 0.75 + heat * 0.2, 0.4 + heat * 0.3], n * 6);
      n++;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, n * 2);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
