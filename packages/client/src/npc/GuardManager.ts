import * as THREE from 'three';
import { DIFFICULTIES, raycastBoxes, WEAPONS, type DifficultyId, type PropDef, type WeaponId } from '@gungame/shared';
import type { Game } from '../core/Game';
import { Guard, GUARD_JOG, GUARD_RUN, GUARD_WALK, type GuardDef } from './Guard';

/**
 * 0 calm; 1 suspicious (someone is checking something out); 2 alert (they know you're here: guards
 * hunt and reinforcements come); 3 lockdown (the whole place is after you, for good).
 */
export type AlarmLevel = 0 | 1 | 2 | 3;

export type GuardEvent =
  | { type: 'spotted'; guard: Guard }
  | { type: 'bodyFound'; guard: Guard; body: Guard }
  | { type: 'camera'; at: THREE.Vector3 }
  | { type: 'alarm'; level: AlarmLevel; reason: string }
  | { type: 'killed'; guard: Guard; silent: boolean }
  | { type: 'takedown'; guard: Guard }
  | { type: 'reinforcements'; count: number }
  | { type: 'shot'; guard: Guard; at: THREE.Vector3 };

/** Someone else the guards might shoot at (a freed hostage). */
export interface OtherTarget {
  readonly position: THREE.Vector3;
  alive: boolean;
  hurt(amount: number): void;
}

const VIEW_HALF_ANGLE = THREE.MathUtils.degToRad(58);
const RANGE = { stand: 30, crouch: 19, prone: 10 } as const;
/** Seconds of not seeing you before an alert winds down to suspicious, and suspicious to calm. */
const ALERT_COOLDOWN = 55;
const SUSPICION_COOLDOWN = 50;
const REINFORCE_INTERVAL = 70;
const CAMERA_RANGE = 26;

/**
 * Runs the security team: patrols and posts, what each guard sees and hears (you, bodies, noises,
 * cameras), the shared alarm level, searching, combat (shooting with a bit of a reaction time,
 * strafing, closing in), takedowns and reinforcements.
 */
export class GuardManager {
  readonly guards: Guard[] = [];
  alarm: AlarmLevel = 0;
  /** Guard events for the mission (spotted, bodies, alarms...). */
  onEvent: (e: GuardEvent) => void = () => {};
  /** Freed hostage etc. that guards may also shoot. */
  others: OtherTarget[] = [];
  /** Stops reinforcements outside lockdown after this many waves. */
  maxWaves = 2;
  private waves = 0;
  private reinforceTimer = REINFORCE_INTERVAL;
  private calmTimer = 0;
  private tick = 0;
  private readonly cameraMeter = new Map<number, number>();
  private readonly deadCams = new Set<object>();
  private readonly deadCamTimers = new Map<object, number>();
  private readonly diff: (typeof DIFFICULTIES)[DifficultyId];
  private readonly root = new THREE.Group();
  private readonly ray = new THREE.Raycaster();
  /** Where reinforcements arrive. */
  private readonly entries: THREE.Vector3[];

  constructor(private readonly game: Game, props: readonly PropDef[], difficulty: DifficultyId, skip: ReadonlySet<string> = new Set()) {
    this.diff = DIFFICULTIES[difficulty];
    game.gfx.scene.add(this.root);
    for (const p of props) {
      if (p.kind !== 'guard') continue;
      const g = new Guard(p, this.root);
      if (skip.has(g.id)) {
        // Already dealt with (checkpoint): leave the body where they stood.
        g.state = 'dead';
        g.downAnim = 1;
        g.discovered = true;
        g.searched = true;
      }
      this.guards.push(g);
    }
    this.entries = props.filter(p => p.kind === 'marker' && p.id.startsWith('reinforce')).map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  /** Projectile hit volumes of the guards still standing (bodies can be shot too, harmlessly). */
  hitTargets(): THREE.Object3D[] {
    return this.guards.flatMap(g => g.hitboxes);
  }

  // ---------- Events from the world ----------

  /** A sound: guards in earshot react. Walls halve how far it carries. */
  noise(at: THREE.Vector3, radius: number, kind: 'gunshot' | 'glass' | 'impact' | 'footsteps' | 'thud' | 'voice'): void {
    for (const g of this.guards) {
      if (!g.alive) continue;
      const d = g.eye.distanceTo(at);
      if (d > radius) continue;
      if (d > radius * 0.5 && !this.game.world.clearLine(g.eye, at)) continue;
      if (kind === 'gunshot') {
        // Gunfire nearby: they know roughly where it came from.
        g.lastKnown.copy(at);
        if (g.state !== 'combat') this.investigate(g, at, true);
        this.raise(d < radius * 0.6 ? 2 : 1, 'Gunshots heard');
      } else if (g.state === 'patrol' || g.state === 'post' || g.state === 'search') {
        this.investigate(g, at, false);
        if (this.alarm < 1) this.raise(1, kind === 'glass' ? 'Breaking glass' : 'A noise');
      }
    }
  }

  /** A guard was shot. */
  damage(g: Guard, amount: number, head: boolean, from: THREE.Vector3): boolean {
    if (!g.alive) return false;
    g.hp -= amount * (head ? 1 : 1);
    if (g.hp <= 0) {
      this.kill(g, 'dead');
      return true;
    }
    // Hit but standing: they know where it came from.
    g.lastKnown.copy(from);
    g.awareness = 1;
    this.enterCombat(g);
    return false;
  }

  /** Is this guard unaware of you and close enough to take down from behind (or seated)? */
  canTakeDown(g: Guard, player: THREE.Vector3): boolean {
    if (!g.alive || g.state === 'combat') return false;
    const to = player.clone().sub(g.pos as THREE.Vector3);
    if (Math.abs(to.y) > 1) return false;
    to.y = 0;
    const d = to.length();
    if (d > 1.7) return false;
    const behind = to.normalize().dot(g.facing) < -0.25;
    return behind || (g.seated && g.awareness < 0.6) || g.awareness < 0.25 && d < 1.1;
  }

  takeDown(g: Guard): void {
    this.kill(g, 'down');
    this.game.audio.takedown();
    this.noise(new THREE.Vector3(g.pos.x, g.pos.y + 0.5, g.pos.z), 4, 'thud');
    this.onEvent({ type: 'takedown', guard: g });
  }

  private kill(g: Guard, state: 'down' | 'dead'): void {
    g.state = state;
    g.seated = false;
    g.awareness = 0;
    g.vel = { x: 0, y: g.vel.y, z: 0 };
    if (state === 'dead') this.onEvent({ type: 'killed', guard: g, silent: this.alarm < 2 });
  }

  /** The body within reach that has something on it, for searching (E). */
  searchable(player: THREE.Vector3): Guard | null {
    return this.guards.find(g => !g.alive && g.carries && !g.searched &&
      new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z).distanceTo(player) < 2.2) ?? null;
  }

  /** A guard you can take down right now. */
  takedownTarget(player: THREE.Vector3): Guard | null {
    return this.guards.find(g => this.canTakeDown(g, player)) ?? null;
  }

  /** Sets the alarm level (it only goes up here; it winds down by itself). */
  raise(level: AlarmLevel, reason: string): void {
    if (level <= this.alarm) {
      if (level >= 2) this.calmTimer = 0;
      return;
    }
    this.alarm = level;
    this.calmTimer = 0;
    this.onEvent({ type: 'alarm', level, reason });
    if (level >= 2) {
      // Everyone gets wary; those near the trouble come running.
      for (const g of this.guards) g.wary = 1;
    }
  }

  /** Lockdown: all remaining guards hunt you, reinforcements keep coming. */
  lockdown(at: THREE.Vector3): void {
    this.raise(3, 'Lockdown');
    for (const g of this.guards) {
      if (!g.alive) continue;
      g.lastKnown.copy(at);
      g.seated = false;
      this.enterCombat(g);
    }
    this.reinforceTimer = 25;
  }

  // ---------- The frame ----------

  update(dt: number): void {
    const g0 = this.game;
    const player = g0.player;
    const chest = new THREE.Vector3(player.pos.x, player.pos.y + Math.max(0.3, player.eyeHeight - 0.35), player.pos.z);
    const camPos = g0.gfx.camera.position;
    this.tick++;
    let anyoneSees = false;
    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i];
      // Far, calm guards think and animate less often.
      const dist = camPos.distanceTo(g.pos as THREE.Vector3);
      const far = dist > 45 && g.state !== 'combat';
      const every = dist > 40 ? 3 : dist > 22 ? 2 : 1;
      g.bodyDt += dt;
      if (g.alive && (!far || (this.tick + i) % 3 === 0)) {
        if ((this.tick + i) % 4 === 0) this.perceive(g, chest, dt * 4);
        this.think(g, dt * (far ? 3 : 1), chest);
      } else if (!g.alive) g.hold(dt, g0.world.colliders);
      if (g.canSee) anyoneSees = true;
      if (g.avatar) {
        g.avatar.group.visible = dist < 90;
        g.avatar.gunCulled = dist > 30;
      }
      if ((this.tick + i) % every === 0) {
        g.updateBody(g.bodyDt, g.state === 'combat' && g.canSee);
        g.bodyDt = 0;
      }
      if (g.alive && g.speed > 0.2) g0.world.doors.npcPass(new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z));
    }
    this.cameras(dt, chest);
    this.alarmTick(dt, anyoneSees);
  }

  /** Eyes: you, and bodies. Builds awareness; full awareness means they've spotted you. */
  private perceive(g: Guard, chest: THREE.Vector3, dt: number): void {
    const player = this.game.player;
    const eye = g.eye;
    const to = chest.clone().sub(eye);
    const d = to.length();
    const range = RANGE[player.stance] * (this.game.weapons.lightOn ? 1.6 : 1) * (g.state === 'combat' ? 1.6 : 1);
    let sees = false;
    if (d < range) {
      const flat = to.clone().setY(0).normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(flat.dot(g.facing), -1, 1));
      const vertical = Math.abs(Math.atan2(to.y, Math.hypot(to.x, to.z)));
      const inCone = (angle < VIEW_HALF_ANGLE && vertical < 1.0) || d < 2.2 || g.state === 'combat' && angle < 1.9;
      if (inCone && this.game.world.clearLine(eye, chest)) {
        sees = true;
        const centre = 1 - (angle / VIEW_HALF_ANGLE) * 0.5;
        const stance = player.stance === 'crouch' ? 0.55 : player.stance === 'prone' ? 0.3 : 1;
        const moving = player.horizontalSpeed > 6.5 ? 1.7 : player.horizontalSpeed > 0.5 ? 1.15 : 0.85;
        const state = g.state === 'combat' ? 4 : g.state === 'investigate' || g.state === 'search' ? 1.6 : 1;
        const seated = g.seated ? 0.6 : 1;
        // Close is instant, far is slow: about a quarter second at 3 m, three at 15 m, ten at 25 m.
        const near = 2.2 / (0.3 + (d / 6) ** 2);
        // At night you're harder to make out away from the lights (your weapon light gives you away).
        const dark = this.game.gfx.night > 0.5 && !this.game.weapons.lightOn ? 0.7 : 1;
        const rate = near * centre * stance * moving * state * seated * dark * (1 + g.wary * 0.6) * this.diff.aim;
        g.awareness = Math.min(1, g.awareness + rate * dt);
      }
    }
    g.canSee = sees && g.awareness >= 1;
    if (sees) {
      g.lastKnown.set(player.pos.x, player.pos.y, player.pos.z);
      if (g.awareness >= 1) g.sinceSeen = 0;
    }
    if (!sees) g.awareness = Math.max(0, g.awareness - dt * (g.state === 'patrol' || g.state === 'post' ? 0.12 : 0.05));

    if (g.awareness >= 1 && g.state !== 'combat') {
      this.enterCombat(g);
      this.onEvent({ type: 'spotted', guard: g });
      this.game.audio.bark('spotted', eye);
      this.raise(2, `${g.name ?? 'A guard'} spotted you`);
    } else if (sees && g.awareness > 0.45 && (g.state === 'patrol' || g.state === 'post')) {
      // A glimpse: go and look.
      this.investigate(g, g.lastKnown, false);
      this.game.audio.bark('huh', eye);
      this.raise(1, 'A guard saw something');
    }

    // Bodies.
    if (g.state !== 'combat') {
      for (const b of this.guards) {
        if (b.alive || b.discovered || b === g) continue;
        const at = new THREE.Vector3(b.pos.x, b.pos.y + 0.3, b.pos.z);
        const bt = at.clone().sub(eye);
        const bd = bt.length();
        if (bd > 17) continue;
        const ang = Math.acos(THREE.MathUtils.clamp(bt.setY(0).normalize().dot(g.facing), -1, 1));
        if (ang > VIEW_HALF_ANGLE * 1.1 || !this.game.world.clearLine(eye, at)) continue;
        b.discovered = true;
        this.onEvent({ type: 'bodyFound', guard: g, body: b });
        this.game.audio.bark('body', eye);
        this.investigate(g, at, true);
        g.wary = 1;
        this.raise(2, 'A body was found');
      }
    }
  }

  private investigate(g: Guard, at: THREE.Vector3, urgent: boolean): void {
    if (g.state === 'combat') return;
    g.state = 'investigate';
    g.seated = false;
    g.searchTime = urgent ? 22 : 12;
    g.lastKnown.copy(at);
    g.setGoal(at, this.game.world.nav);
    g.wait = urgent ? 0 : 0.8; // a beat to react
    (g as { urgent?: boolean }).urgent = urgent;
  }

  private enterCombat(g: Guard): void {
    if (g.state !== 'combat') {
      g.reaction = (0.55 + Math.random() * 0.45) / this.diff.aim;
      g.burstLeft = 0;
    }
    g.state = 'combat';
    g.seated = false;
    g.repath = 0;
  }

  /** The brain: movement and actions for the state they're in. */
  private think(g: Guard, dt: number, chest: THREE.Vector3): void {
    const world = this.game.world;
    const colliders = world.colliders;
    g.sinceSeen += dt;
    g.wary = Math.max(0, g.wary - dt / 240);
    g.barkCooldown -= dt;
    const def = g.def as GuardDef;
    switch (g.state) {
      case 'post': {
        // Back to the post first if they left it.
        const home = new THREE.Vector3(def.x, def.y, def.z);
        if (home.distanceTo(g.pos as THREE.Vector3) > 0.8) {
          if (!g.goal) g.setGoal(home, world.nav);
          if (g.follow(dt, GUARD_WALK, colliders)) g.goal = null;
          break;
        }
        g.goal = null;
        g.seated = !!def.seated;
        g.hold(dt, colliders);
        const scan = def.scan ?? 0.6;
        g.headTurn = Math.sin(performance.now() / 1000 * 0.35 + g.pos.x) * scan;
        g.turnTo(def.yaw, dt, 2);
        break;
      }
      case 'patrol': {
        const route = def.route!;
        g.headTurn = Math.sin(performance.now() / 1000 * 0.5 + g.pos.z) * 0.35;
        if (g.wait > 0) {
          g.wait -= dt;
          g.hold(dt, colliders);
          g.headTurn = Math.sin(performance.now() / 1000 * 0.8 + g.pos.x) * 0.9;
          break;
        }
        if (!g.goal) g.setGoal(route[g.routeIndex], world.nav);
        if (g.follow(dt, GUARD_WALK * (1 + g.wary * 0.15), colliders)) {
          g.wait = route[g.routeIndex].wait ?? 1.5;
          g.routeIndex = (g.routeIndex + 1) % route.length;
          g.goal = null;
        }
        break;
      }
      case 'investigate': {
        g.headTurn *= 0.9;
        if (g.wait > 0) {
          g.wait -= dt;
          g.hold(dt, colliders);
          g.turnTo(Math.atan2(-(g.lastKnown.x - g.pos.x), -(g.lastKnown.z - g.pos.z)), dt, 5);
          break;
        }
        const urgent = (g as { urgent?: boolean }).urgent;
        if (g.follow(dt, urgent ? GUARD_JOG : GUARD_WALK * 1.2, colliders)) {
          // Got there: look around nearby for a while.
          g.state = 'search';
          g.goal = null;
        }
        break;
      }
      case 'search': {
        g.searchTime -= dt;
        if (g.searchTime <= 0) {
          this.returnToDuty(g);
          break;
        }
        g.headTurn = Math.sin(performance.now() / 1000 * 1.1 + g.pos.x) * 1.0;
        if (!g.goal || g.follow(dt, GUARD_WALK * 1.3, colliders)) {
          g.wait -= dt;
          g.hold(dt, colliders);
          if (g.wait <= 0) {
            const p = world.nav.randomNear(g.lastKnown, 7);
            if (p) g.setGoal(p, world.nav);
            g.wait = 1.5 + Math.random() * 2;
          }
        }
        break;
      }
      case 'combat':
        this.fight(g, dt, chest);
        break;
    }
  }

  private returnToDuty(g: Guard): void {
    g.state = g.def.route?.length ? 'patrol' : 'post';
    g.goal = null;
    g.awareness = Math.min(g.awareness, 0.3);
  }

  /** Combat: face you, shoot in bursts when they can see you, close in or hold, chase when they can't. */
  private fight(g: Guard, dt: number, chest: THREE.Vector3): void {
    const world = this.game.world;
    const colliders = world.colliders;
    const eye = g.eye;
    g.headTurn *= 0.8;
    // Target: you, or a freed hostage if they're closer and in sight.
    let target = chest;
    let other: OtherTarget | null = null;
    for (const o of this.others) {
      if (!o.alive) continue;
      const oc = o.position.add(new THREE.Vector3(0, 1.2, 0));
      if (oc.distanceTo(eye) < chest.distanceTo(eye) * 0.8 && world.clearLine(eye, oc)) { target = oc; other = o; }
    }
    const d = target.distanceTo(eye);
    const seeing = other ? true : g.canSee;
    if (seeing) {
      g.turnTo(Math.atan2(-(target.x - g.pos.x), -(target.z - g.pos.z)), dt, 9);
      g.aimPitch = Math.atan2(target.y - eye.y, Math.hypot(target.x - eye.x, target.z - eye.z));
      // Position: close in from far, back off when too close, otherwise sidestep now and then.
      g.strafeTimer -= dt;
      if (d > g.gun.range * 0.75) {
        if (!g.goal || g.repath <= 0) g.setGoal(new THREE.Vector3(this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z), world.nav);
        g.repath -= dt;
        g.follow(dt, GUARD_JOG, colliders);
      } else if (g.strafeTimer <= 0) {
        g.strafeTimer = 1.6 + Math.random() * 2;
        const p = world.nav.randomNear(new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z), 2.5);
        if (p) g.setGoal(p, world.nav); else g.goal = null;
      } else if (g.goal) {
        if (g.follow(dt, GUARD_WALK * 1.4, colliders)) g.goal = null;
      } else g.hold(dt, colliders);
      // Keep facing the target while moving.
      g.turnTo(Math.atan2(-(target.x - g.pos.x), -(target.z - g.pos.z)), dt, 12);
      this.shoot(g, dt, target, other, d);
    } else {
      // Lost sight: go to where they last saw you, then search.
      g.reaction = Math.max(g.reaction, 0.35);
      g.repath -= dt;
      if (g.sinceSeen > 9) {
        g.state = 'search';
        g.searchTime = 25;
        g.goal = null;
        return;
      }
      if (!g.goal || g.repath <= 0) g.setGoal(g.lastKnown, world.nav);
      if (g.follow(dt, GUARD_RUN, colliders)) {
        g.state = 'search';
        g.searchTime = 25;
        g.goal = null;
      }
    }
  }

  private shoot(g: Guard, dt: number, target: THREE.Vector3, other: OtherTarget | null, d: number): void {
    if (g.reaction > 0) {
      g.reaction -= dt;
      return;
    }
    g.fireTimer -= dt;
    if (g.fireTimer > 0) return;
    const gun = g.gun;
    if (g.burstLeft <= 0) g.burstLeft = gun.burst;
    g.burstLeft--;
    g.fireTimer = g.burstLeft > 0 ? gun.interval : gun.pause + Math.random() * 0.6;
    const muzzle = g.eye.clone().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(g.facing, 0.55);
    const player = this.game.player;
    // Hit chance: distance, your stance and movement, their gun and difficulty.
    const range = THREE.MathUtils.clamp(1 - (d - 4) / gun.range, 0.12, 1);
    const moving = other ? 1 : player.horizontalSpeed > 6.5 ? 0.55 : player.horizontalSpeed > 1 ? 0.8 : 1;
    const small = other ? 1 : player.stance === 'crouch' ? 0.85 : player.stance === 'prone' ? 0.6 : 1;
    const chance = THREE.MathUtils.clamp(0.62 * range * moving * small * this.diff.aim / gun.spread, 0.04, 0.9);
    const hit = Math.random() < chance && this.game.world.clearLine(muzzle, target);
    const sound = WEAPONS[g.weapon].sound;
    this.game.audio.shotAt(sound, muzzle, g.weapon === 'pistol' ? 0.8 : 1);
    this.onEvent({ type: 'shot', guard: g, at: muzzle });
    if (hit) {
      this.game.fx.tracer(muzzle, target.clone().add(new THREE.Vector3(0, -0.1, 0)), 0xffd28a);
      const dmg = gun.damage * this.diff.damage * (0.85 + Math.random() * 0.3);
      if (other) other.hurt(dmg);
      else this.game.hurtPlayer(dmg, g.pos);
    } else {
      // A miss: the round goes past you and hits whatever's behind.
      const dir = target.clone().sub(muzzle).normalize();
      dir.x += (Math.random() - 0.5) * 0.08 * gun.spread;
      dir.y += (Math.random() - 0.5) * 0.05 * gun.spread;
      dir.z += (Math.random() - 0.5) * 0.08 * gun.spread;
      dir.normalize();
      const h = raycastBoxes(muzzle, dir, 80, this.game.world.colliders)[0];
      const end = muzzle.clone().addScaledVector(dir, h ? h.tIn : 60);
      this.game.fx.tracer(muzzle, end, 0xffd28a);
      if (h) this.game.fx.impact(end, new THREE.Vector3(h.normalIn.x, h.normalIn.y, h.normalIn.z), 'masonry', 3);
      if (end.distanceTo(this.game.gfx.camera.position) < 3) this.game.audio.whiz();
    }
  }

  /** Security cameras: a camera that sees you long enough calls it in. */
  private cameras(dt: number, chest: THREE.Vector3): void {
    const sec = this.game.world.security;
    if (sec.looped || this.alarm === 3) return;
    // A dead feed gets noticed in the security room (if anyone's watching): someone goes to look.
    const watcher = this.guards.find(g => g.id === 'monitors' && g.alive);
    for (const c of sec.cams) {
      if (!c.destroyed || this.deadCams.has(c)) continue;
      const t = (this.deadCamTimers.get(c) ?? 14) - dt;
      this.deadCamTimers.set(c, t);
      if (t > 0 || !watcher) continue;
      this.deadCams.add(c);
      const at = c.pivot.getWorldPosition(new THREE.Vector3());
      const g = this.guards.filter(x => x.alive && x.state !== 'combat' && x.id !== 'monitors')
        .sort((a, b) => at.distanceTo(a.pos as THREE.Vector3) - at.distanceTo(b.pos as THREE.Vector3))[0];
      if (g) {
        const ground = this.game.world.nav.nearest({ x: at.x, y: at.y - 3, z: at.z }, 4);
        this.investigate(g, ground >= 0 ? new THREE.Vector3().copy(this.game.world.nav.point(ground) as THREE.Vector3) : at, false);
      }
      this.game.audio.bark('camera', watcher.eye);
      this.onEvent({ type: 'camera', at });
      this.raise(1, 'A camera went dark');
    }
    const ndc = new THREE.Vector3();
    sec.cams.forEach((c, i) => {
      if (c.destroyed || sec.ignored.has(c.def.id)) return;
      const pos = c.view.getWorldPosition(new THREE.Vector3());
      const d = pos.distanceTo(chest);
      let sees = false;
      if (d < CAMERA_RANGE) {
        c.view.updateMatrixWorld();
        ndc.copy(chest).applyMatrix4(c.view.matrixWorldInverse).applyMatrix4(c.view.projectionMatrix);
        sees = Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z > -1 && ndc.z < 1 && this.game.world.clearLine(pos, chest);
      }
      const stance = this.game.player.stance === 'stand' ? 1 : this.game.player.stance === 'crouch' ? 0.6 : 0.35;
      let m = this.cameraMeter.get(i) ?? 0;
      m = sees ? m + dt * (0.95 / (0.6 + d * 0.09)) * stance * this.diff.aim : Math.max(0, m - dt * 0.25);
      this.cameraMeter.set(i, Math.min(1, m));
      if (m >= 1) {
        this.cameraMeter.set(i, 0);
        const at = new THREE.Vector3(this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z);
        this.onEvent({ type: 'camera', at });
        this.game.audio.bark('camera', pos);
        // Security sends the two nearest guards to have a look; a second sighting is an alert.
        const near = this.guards.filter(g => g.alive && g.state !== 'combat')
          .sort((a, b) => at.distanceTo(a.pos as THREE.Vector3) - at.distanceTo(b.pos as THREE.Vector3)).slice(0, 2);
        for (const g of near) this.investigate(g, at, true);
        this.raise(this.alarm >= 1 ? 2 : 1, 'A camera spotted you');
      }
    });
  }

  /** The highest camera detection right now (for the HUD). */
  cameraDetection(): number {
    let m = 0;
    for (const v of this.cameraMeter.values()) m = Math.max(m, v);
    return m;
  }

  private alarmTick(dt: number, seen: boolean): void {
    if (this.alarm === 3) {
      this.reinforceTick(dt, true);
      return;
    }
    if (seen) this.calmTimer = 0;
    else this.calmTimer += dt;
    if (this.alarm === 2) {
      this.reinforceTick(dt, false);
      if (this.calmTimer > ALERT_COOLDOWN && !this.guards.some(g => g.state === 'combat')) {
        this.alarm = 1;
        this.calmTimer = 0;
        this.onEvent({ type: 'alarm', level: 1, reason: 'They lost you' });
      }
    } else if (this.alarm === 1 && this.calmTimer > SUSPICION_COOLDOWN && !this.guards.some(g => g.state === 'investigate' || g.state === 'combat')) {
      this.alarm = 0;
      this.onEvent({ type: 'alarm', level: 0, reason: 'Back to normal' });
    }
  }

  private reinforceTick(dt: number, lockdown: boolean): void {
    if (!lockdown && this.waves >= this.maxWaves) return;
    this.reinforceTimer -= dt;
    if (this.reinforceTimer > 0) return;
    this.reinforceTimer = lockdown ? 45 : REINFORCE_INTERVAL;
    this.waves++;
    const entry = this.entries[this.waves % Math.max(1, this.entries.length)] ?? new THREE.Vector3(0, 4.2, 52);
    const count = lockdown ? 4 : 3;
    const weapons: WeaponId[] = ['rifle', 'rifle', 'smg', 'shotgun'];
    for (let i = 0; i < count; i++) {
      const def: GuardDef = {
        kind: 'guard', id: `reinforce-${this.waves}-${i}`, x: entry.x + (i - 1.5) * 1.2, y: entry.y, z: entry.z + (i % 2) * 1.2,
        yaw: 0, weapon: weapons[i % weapons.length], look: 'tactical',
      };
      const g = new Guard(def, this.root);
      g.reinforcement = true;
      g.wary = 1;
      g.lastKnown.set(this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z);
      this.enterCombat(g);
      g.sinceSeen = 0;
      this.guards.push(g);
    }
    this.onEvent({ type: 'reinforcements', count });
  }

  /** Strongest detection any guard has on you, and from which direction (for the HUD). */
  detections(): { dir: THREE.Vector3; amount: number; combat: boolean }[] {
    const out: { dir: THREE.Vector3; amount: number; combat: boolean }[] = [];
    for (const g of this.guards) {
      if (!g.alive || (g.awareness < 0.05 && g.state !== 'combat')) continue;
      out.push({ dir: new THREE.Vector3(g.pos.x, g.pos.y + 1.6, g.pos.z), amount: g.state === 'combat' ? 1 : g.awareness, combat: g.state === 'combat' });
    }
    return out;
  }

  /** Bodies a non-guard (a guest) could see from `eye` within `range`. */
  visibleBody(eye: THREE.Vector3, range: number): Guard | null {
    for (const b of this.guards) {
      if (b.alive) continue;
      const at = new THREE.Vector3(b.pos.x, b.pos.y + 0.3, b.pos.z);
      if (at.distanceTo(eye) < range && this.game.world.clearLine(eye, at)) return b;
    }
    return null;
  }

  dispose(): void {
    for (const g of this.guards) g.dispose();
    this.root.removeFromParent();
    void this.ray;
  }
}
