import * as THREE from 'three';
import { clamp, DIFFICULTIES, GRAVITY, moveAndCollide } from '@gungame/shared';
import type { Game } from '../core/Game';
import { Bot, BOT_EYE_HEIGHT, BOT_MUZZLE } from './Bot';

const NAMES = ['Viper', 'Ghost', 'Rook', 'Blitz', 'Havoc', 'Nomad', 'Raptor', 'Jinx', 'Tank', 'Echo', 'Wraith', 'Diesel'];
const BOT_SHOT_SOUND = { cutoff: 1600, decay: 0.15 };

/** Spawns bots and runs their AI: chase, strafe, back off, shoot when they can see the player. */
export class BotManager {
  readonly bots: Bot[] = [];
  private nameIndex = 0;

  constructor(private readonly game: Game) {}

  get aliveCount(): number {
    return this.bots.reduce((n, b) => n + (b.dead ? 0 : 1), 0);
  }

  spawn(minDistFromPlayer = 20): Bot | null {
    const at = this.game.world.randomOpenPoint(this.game.player.pos, minDistFromPlayer);
    if (!at) return null;
    const bot = new Bot(at, NAMES[this.nameIndex++ % NAMES.length]);
    this.game.gfx.scene.add(bot.group);
    this.bots.push(bot);
    return bot;
  }

  clear(): void {
    for (const b of this.bots) this.game.gfx.scene.remove(b.group);
    this.bots.length = 0;
  }

  hitTargets(): THREE.Object3D[] {
    return this.bots.filter(b => !b.dead).flatMap(b => b.hitboxes);
  }

  /** Applies damage. Returns true if this killed the bot. */
  damage(bot: Bot, amount: number, headshot: boolean): boolean {
    if (bot.dead) return false;
    bot.hp -= amount;
    bot.flash();
    if (bot.hp > 0) return false;
    bot.die();
    this.game.fx.sparks(bot.head.getWorldPosition(new THREE.Vector3()), 14, 0xb71c1c);
    this.game.onBotKilled(bot, headshot);
    return true;
  }

  /** @param combat false for the menu backdrop: bots just patrol and never shoot. */
  update(dt: number, combat: boolean): void {
    const g = this.game;
    const playerEye = g.player.eye();
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i];
      if (bot.dead) {
        if (bot.animateDeath(dt)) {
          g.gfx.scene.remove(bot.group);
          this.bots.splice(i, 1);
        }
        continue;
      }
      const dx = g.player.pos.x - bot.pos.x;
      const dz = g.player.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const fx = dx / dist;
      const fz = dz / dist;

      if (combat) this.updateAwareness(bot, dist, playerEye, dt);
      this.steer(bot, fx, fz, dist, combat, dt);
      this.separate(bot, fx, fz, dist);
      bot.syncVisuals(dt, combat ? Math.atan2(fx, fz) : Math.atan2(bot.vel.x, bot.vel.z));
      if (combat) this.tryShoot(bot, dist, playerEye, dt);
    }
  }

  private updateAwareness(bot: Bot, dist: number, playerEye: THREE.Vector3, dt: number): void {
    bot.losTimer -= dt;
    if (bot.losTimer > 0) return;
    const hadSight = bot.canSeePlayer;
    const botEye = new THREE.Vector3(bot.pos.x, bot.pos.y + BOT_EYE_HEIGHT, bot.pos.z);
    bot.canSeePlayer = dist < 60 && this.game.world.hasLineOfSight(botEye, playerEye);
    if (bot.canSeePlayer && !hadSight) bot.fireCooldown = Math.max(bot.fireCooldown, 0.5 + Math.random() * 0.5); // reaction time
    bot.losTimer = 0.15 + Math.random() * 0.1;
  }

  private steer(bot: Bot, fx: number, fz: number, dist: number, combat: boolean, dt: number): void {
    if (!combat && !bot.wander) {
      const a = Math.random() * Math.PI * 2;
      bot.wander = { x: Math.cos(a), z: Math.sin(a) };
      bot.wanderTimer = 2 + Math.random() * 3;
    }
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) {
      bot.strafeDir *= -1;
      bot.strafeTimer = 0.8 + Math.random() * 2;
    }
    let mx: number;
    let mz: number;
    const s = bot.strafeDir;
    if (bot.wander) {
      mx = bot.wander.x;
      mz = bot.wander.z;
      bot.wanderTimer -= dt;
      if (bot.wanderTimer <= 0) bot.wander = null;
    } else if (!bot.canSeePlayer || dist > 16) { mx = fx - fz * s * 0.3; mz = fz + fx * s * 0.3; } // close in
    else if (dist < 6) { mx = -fx - fz * s; mz = -fz + fx * s; } // back off
    else { mx = -fz * s; mz = fx * s; } // strafe
    const len = Math.hypot(mx, mz) || 1;
    bot.vel.x = mx / len * bot.speed;
    bot.vel.z = mz / len * bot.speed;
    bot.vel.y -= GRAVITY * dt;

    const before = bot.pos.clone();
    moveAndCollide(bot, this.game.world.colliders, dt);
    if (!bot.wander && before.distanceTo(bot.pos) < bot.speed * dt * 0.3) {
      const a = Math.random() * Math.PI * 2;
      bot.wander = { x: Math.cos(a), z: Math.sin(a) };
      bot.wanderTimer = 0.6 + Math.random() * 0.6;
    }
  }

  private separate(bot: Bot, fx: number, fz: number, dist: number): void {
    for (const o of this.bots) {
      if (o === bot || o.dead) continue;
      const sx = bot.pos.x - o.pos.x;
      const sz = bot.pos.z - o.pos.z;
      const sd = Math.hypot(sx, sz);
      if (sd < 0.9 && sd > 0.001) {
        bot.pos.x += sx / sd * (0.9 - sd) * 0.5;
        bot.pos.z += sz / sd * (0.9 - sd) * 0.5;
      }
    }
    if (dist < 0.9) {
      bot.pos.x -= fx * (0.9 - dist);
      bot.pos.z -= fz * (0.9 - dist);
    }
  }

  private tryShoot(bot: Bot, dist: number, playerEye: THREE.Vector3, dt: number): void {
    if (!bot.canSeePlayer || dist >= 50) return;
    bot.fireCooldown -= dt;
    if (bot.fireCooldown > 0) return;
    bot.fireCooldown = 0.8 + Math.random() * 1.1;

    const g = this.game;
    const diff = DIFFICULTIES[g.difficulty];
    const muzzle = bot.group.localToWorld(BOT_MUZZLE.clone());
    const stance = g.player.stance === 'prone' ? 0.5 : g.player.stance === 'crouch' ? 0.75 : 1;
    const hitChance = clamp(0.62 - dist * 0.011 - g.player.horizontalSpeed * 0.025, 0.12, 0.62) * diff.aim * stance;
    g.audio.shot(BOT_SHOT_SOUND, clamp(1.2 - dist / 50, 0.15, 0.6));
    if (Math.random() < hitChance) {
      g.fx.tracer(muzzle, playerEye.clone().setY(playerEye.y - 0.3), 0xff9a7a);
      g.hurtPlayer((7 + Math.random() * 6) * diff.damage, bot.pos);
    } else {
      const miss = playerEye.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5));
      g.fx.tracer(muzzle, muzzle.clone().add(miss.sub(muzzle).multiplyScalar(1.6)), 0xff9a7a);
      g.audio.beep(2400 + Math.random() * 1200, 0.04, 'sine', 0.025);
    }
  }
}
