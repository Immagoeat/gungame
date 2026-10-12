import * as THREE from 'three';
import {
  Buttons, clamp, createMap, WEAPONS, hasButton, isSprinting, STANCES, stepMovement, type MapId, type Vec3, type WeaponDef, type WeaponId,
} from '@gungame/shared';
import { BotManager } from '../entities/BotManager';
import type { Bot } from '../entities/Bot';
import { BREATH_SECONDS, Player } from '../entities/Player';
import { createAvatar } from '../entities/avatar';
import { Debris } from '../fx/Debris';
import { Effects } from '../fx/Effects';
import { WaterFx } from '../fx/WaterFx';
import { createMode, type GameMode, type MatchOptions, type MatchResult } from '../modes';
import { escapeHtml } from '../ui/dom';
import { Hud } from '../ui/Hud';
import { Menu } from '../ui/Menu';
import { Projectiles } from '../weapons/Projectiles';
import { WeaponSystem } from '../weapons/WeaponSystem';
import type { GlassPane } from '../world/GlassSystem';
import type { LightFixture } from '../world/LightSystem';
import { LAYER_EFFECTS, LAYER_SHADOW_PROXY } from './layers';
import { LAYER_SCREENS, type SecurityCam } from '../world/SecuritySystem';
import { World } from '../world/World';
import { AudioSystem } from './Audio';
import { Graphics } from './Graphics';
import { Input } from './Input';
import { loadSettings } from './Settings';

/**
 * - menu: main menu with the arena orbiting behind it
 * - starting: match set up, waiting for pointer lock
 * - playing / paused / over: in a match
 */
export type GameState = 'menu' | 'starting' | 'playing' | 'paused' | 'over';

const BASE_SENSITIVITY = 0.0022;
const REGEN_DELAY = 4;
const REGEN_PER_SECOND = 20;
const KILL_HEAL = 15;
const MENU_BACKDROP_BOTS = 7;
const MENU_MAP: MapId = 'arena';
const FLY_SPEED = 10;

/** The engine: owns every system and the state machine. Rules live in the active GameMode. */
export class Game {
  readonly settings = loadSettings();
  readonly gfx: Graphics;
  readonly audio: AudioSystem;
  readonly input: Input;
  world: World;
  readonly player = new Player();
  private readonly avatar = createAvatar();
  /** Noclip flight for reviewing layouts (only in modes that allow it). */
  flying = false;
  readonly fx: Effects;
  readonly debris: Debris;
  readonly waterFx: WaterFx;
  private lastSubmerged = 0;
  private swimTimer = 0;
  private drownTimer = 0;
  readonly weapons: WeaponSystem;
  readonly projectiles: Projectiles;
  readonly bots: BotManager;
  readonly hud = new Hud();
  readonly menu: Menu;

  state: GameState = 'menu';
  /** Seconds since the current match started (excluding pauses). */
  elapsed = 0;
  private mode: GameMode | null = null;
  private options: MatchOptions = { mode: 'gungame', difficulty: 'normal' };
  private readonly clock = new THREE.Clock();
  private menuTime = 0;
  private tinkleBudget = 0;

  constructor(container: HTMLElement) {
    this.gfx = new Graphics(container, this.settings.quality);
    this.audio = new AudioSystem(this.settings.volume);
    this.input = new Input(this.gfx.canvas);
    this.world = new World(createMap(MENU_MAP), this.gfx.scene);
    this.gfx.prepare(this.gfx.scene);
    this.gfx.camera.layers.enable(LAYER_SCREENS);
    this.gfx.camera.layers.enable(LAYER_SHADOW_PROXY);
    this.gfx.camera.layers.enable(LAYER_EFFECTS);
    this.gfx.scene.add(this.avatar.group);
    this.fx = new Effects(this.gfx.scene);
    this.debris = new Debris(this.gfx.scene, () => this.world.colliders, () => this.world.water);
    this.waterFx = new WaterFx(this.gfx.scene);
    this.debris.onSplash = (at, surface, speed) => this.waterFx.ripple(at, surface, 0.2 + Math.min(0.6, speed * 0.08));
    this.debris.onCrunch = () => this.audio.crunch();
    this.debris.onImpact = (speed, kind) => {
      if (kind === 'rigid') this.audio.clunk();
      else if (this.tinkleBudget > 0) {
        this.tinkleBudget--;
        this.audio.tinkle(Math.min(1, speed / 6));
      }
    };
    this.weapons = new WeaponSystem(this);
    this.projectiles = new Projectiles(this);
    this.bots = new BotManager(this);
    this.menu = new Menu(this);

    this.input.onKeyDown = code => {
      if (this.state !== 'playing') return;
      if (code === 'KeyR') this.weapons.startReload();
      if (code === 'KeyF') this.weapons.toggleFlashlight();
      if (/^Digit[1-9]$/.test(code)) this.weapons.selectSlot(Number(code.slice(5)) - 1);
      if (code === 'KeyQ') this.weapons.swapToPrevious();
      this.onStanceKey(code);
      if (code === 'KeyV' && this.mode?.allowFly) this.toggleFly();
      if ((code === 'BracketLeft' || code === 'BracketRight') && this.mode?.allowFly) {
        this.gfx.setTimeOfDay(Math.round(this.gfx.hours) + (code === 'BracketRight' ? 1 : -1));
        const h = Math.round(this.gfx.hours);
        this.hud.banner(`${String(h).padStart(2, '0')}:00`, h >= 20 || h < 6 ? 'Night' : h < 8 || h >= 18 ? 'Dusk' : 'Day');
      }
    };
    this.input.onWheel = dir => { if (this.state === 'playing') this.weapons.cycle(dir); };
    this.input.onLockChange = locked => this.onPointerLockChange(locked);
    this.input.onLockError = () => {
      // Browsers briefly refuse to re-lock right after Esc; let the player click again.
      if (this.state === 'starting') this.pause();
      this.menu.setHint('Click again to continue.');
    };
  }

  boot(): void {
    this.goToMainMenu();
    this.gfx.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Match flow ----------

  get difficulty() {
    return this.options.difficulty;
  }

  startMatch(options: MatchOptions): void {
    this.audio.init();
    this.mode?.dispose();
    this.options = options;
    const mode = createMode(this, options);
    this.mode = mode;
    this.loadMap(mode.mapId, true); // fresh copy: broken glass and cameras come back
    this.bots.clear();
    this.fx.clear();
    this.hud.reset();
    this.projectiles.clear();
    this.gfx.setTimeOfDay(this.world.map.timeOfDay ?? 15);
    this.player.reset(this.world.map.playerSpawn, this.world.map.spawnYaw);
    this.input.stance = 'stand';
    this.waterFx.clear();
    this.gfx.setUnderwater(false);
    this.audio.setUnderwater(false);
    this.flying = false;
    this.elapsed = 0;
    this.gfx.setFov(this.settings.fov);
    this.weapons.setVisible(true);
    mode.start();
    this.state = 'starting';
    this.input.lock();
  }

  restartMatch(): void {
    this.startMatch(this.options);
  }

  resume(): void {
    this.input.lock();
  }

  goToMainMenu(): void {
    this.mode?.dispose();
    this.mode = null;
    this.state = 'menu';
    this.input.unlock();
    this.loadMap(MENU_MAP);
    this.gfx.setTimeOfDay(15);
    this.projectiles.clear();
    this.bots.clear();
    this.fx.clear();
    this.player.pos.set(0, -100, 0); // out of the way so backdrop bots ignore it
    for (let i = 0; i < MENU_BACKDROP_BOTS; i++) this.bots.spawn();
    this.weapons.setVisible(false);
    this.hud.hide();
    this.menu.showMain();
  }

  /** Called by the active mode when the match is decided. */
  endMatch(result: MatchResult): void {
    this.state = 'over';
    this.input.clearActions();
    this.input.unlock();
    this.hud.hide();
    this.menu.showResults(result);
  }

  private loadMap(id: MapId, force = false): void {
    if (!force && this.world.map.id === id) return;
    this.projectiles.clear();
    this.bots.clear();
    this.fx.clear();
    this.debris.clear();
    this.world.dispose();
    this.world = new World(createMap(id), this.gfx.scene);
    this.gfx.prepare(this.world.root);
  }

  /** C toggles crouch, Z toggles prone, Space or sprint stands back up. */
  private onStanceKey(code: string): void {
    const input = this.input;
    if (this.flying || this.player.swimming) return;
    if (code === 'KeyC') input.stance = input.stance === 'crouch' ? 'stand' : 'crouch';
    else if (code === 'KeyZ') input.stance = input.stance === 'prone' ? 'stand' : 'prone';
    else if ((code === 'Space' || code === 'ShiftLeft') && input.stance !== 'stand') {
      input.stance = input.stance === 'prone' && code === 'Space' ? 'crouch' : 'stand';
      if (code === 'Space') input.jumpBlocked = true;
    }
  }

  private toggleFly(): void {
    this.flying = !this.flying;
    this.player.vel.set(0, 0, 0);
    this.hud.banner(this.flying ? 'Fly mode' : 'Walking', this.flying ? 'Space up · Q down · Shift fast' : '');
  }

  private pause(): void {
    this.state = 'paused';
    this.input.clearActions();
    this.menu.showPause(this.mode?.pauseInfo() ?? '');
  }

  private onPointerLockChange(locked: boolean): void {
    if (locked && (this.state === 'starting' || this.state === 'paused')) {
      this.state = 'playing';
      this.menu.hide();
      this.hud.show();
      this.clock.getDelta(); // don't count time spent in menus
    } else if (!locked && this.state === 'playing') {
      this.pause();
    }
  }

  // ---------- Events from systems ----------

  hurtPlayer(amount: number, from: Vec3): void {
    if (this.state !== 'playing') return;
    const p = this.player;
    p.hp -= amount;
    p.lastHurt = this.elapsed;
    const angle = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
    this.hud.damage(amount, Math.PI - (angle - p.yaw));
    this.audio.beep(110, 0.12, 'sawtooth', 0.12);
    if (p.hp <= 0) {
      p.hp = 0;
      this.mode?.onPlayerDied();
    }
  }

  /** Shatters a pane hit at `point` by something travelling along `dir`. */
  breakGlass(pane: GlassPane, point: THREE.Vector3, dir: THREE.Vector3): void {
    if (pane.broken) return;
    if (this.world.glass.willCrack(pane)) {
      this.world.glass.crack(pane, point);
      this.fx.impact(point, dir, 'glass', 6);
      this.audio.glassCrack();
      return;
    }
    const shape = this.world.glass.shape(pane);
    if (!this.world.breakGlass(pane)) return;
    this.debris.fracture(shape, point, dir);
    this.fx.impact(point, dir, 'glass', 22);
    this.audio.glassBreak(shape.width * shape.height);
  }

  /** Shoots out a light fixture: sparks, falling glass, and the light flickers and dies. */
  shootLight(fixture: LightFixture, point: THREE.Vector3, dir: THREE.Vector3): void {
    if (!this.world.lights.shoot(fixture)) return;
    this.fx.sparks(point, 14, 0xffe6a0, dir.clone().negate());
    this.fx.sparkEmitter(point, 0.8, 0xfff2c0);
    const r = 0.12;
    this.debris.shatter({ min: point.clone().subScalar(r), max: point.clone().addScalar(r) }, point, dir);
    this.audio.glassBreak(0.2);
    this.audio.zap();
  }

  /** Shoots a security camera off its mount. */
  destroyCamera(cam: SecurityCam, point: THREE.Vector3, dir: THREE.Vector3): void {
    const head = this.world.security.destroy(cam);
    if (!head) return;
    const mount = cam.pivot.getWorldPosition(new THREE.Vector3());
    this.debris.addRigid(
      head,
      dir.clone().multiplyScalar(2.5).add(new THREE.Vector3(0, 1.5, 0)),
      new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
      0.15,
    );
    this.fx.sparks(point, 18, 0xffd27a);
    this.fx.sparkEmitter(mount, 2.5);
    this.audio.zap();
  }

  /** The equipped weapon (or its attachments) changed: the body holds the same gun. */
  onWeaponChanged(id: WeaponId, def: WeaponDef): void {
    this.avatar?.setWeapon(id, def.loadout ?? {});
    this.hud.setWeaponSlots(this.weapons.carried.map(w => WEAPONS[w].name), this.weapons.carried.indexOf(id));
  }

  onBotKilled(bot: Bot, headshot: boolean): void {
    if (this.state !== 'playing') return;
    this.hud.feed(`You <b>[${escapeHtml(this.weapons.def.name)}]</b> ${escapeHtml(bot.name)}` +
      (headshot ? ' <span class="hs">HEADSHOT</span>' : ''));
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + KILL_HEAL);
    this.mode?.onBotKilled(bot, headshot);
  }

  // ---------- Frame loop ----------

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this.updateMenuBackdrop(dt);
    if (this.state === 'playing' || this.state === 'menu') {
      this.world.update(dt, this.gfx.night);
      this.tinkleBudget = Math.min(6, this.tinkleBudget + dt * 20);
      this.debris.update(dt);
      this.waterFx.update(dt);
    }
    const p = this.player;
    this.avatar.group.visible = this.state !== 'menu' && !this.flying;
    this.avatar.update(dt, {
      pos: p.pos, yaw: p.yaw, pitch: p.pitch, stance: p.stance, eyeHeight: p.eyeHeight, speed: p.horizontalSpeed,
      forward: -Math.sin(p.yaw) * p.vel.x - Math.cos(p.yaw) * p.vel.z,
      swimming: p.swimming, onGround: p.onGround, aiming: this.input.aiming,
      gunOffset: this.weapons.holder.position, gunRotation: this.weapons.holder.quaternion,
    });
    if (this.state === 'playing') this.world.security.renderFeeds(this.gfx.renderer, this.gfx.scene, this.gfx.camera.position);
    this.gfx.render();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    const p = this.player;
    const cam = this.gfx.camera;

    const { dx, dy } = this.input.consumeLook();
    const sens = BASE_SENSITIVITY * this.settings.sens * (cam.fov / this.settings.fov);
    p.yaw -= dx * sens;
    p.pitch = clamp(p.pitch - dy * sens * (this.settings.invert ? -1 : 1), -1.5, 1.5);

    const buttons = this.input.buttons();
    const sprinting = isSprinting(buttons);
    if (this.flying) this.fly(buttons, dt);
    else stepMovement(p, { buttons, yaw: p.yaw }, dt, this.world.colliders, this.world.water);
    if (this.elapsed - p.lastHurt > REGEN_DELAY && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + REGEN_PER_SECOND * dt);
    this.updateWater(dt);
    if (this.state !== 'playing') return;
    // Glass underfoot breaks up further as you walk over it.
    if (p.onGround && p.horizontalSpeed > 0.5) this.debris.disturb(p.pos, p.stance === 'prone' ? 0.7 : 0.45, p.horizontalSpeed);

    // Camera eases to the stance's eye height.
    p.eyeHeight += (STANCES[p.swimming ? 'stand' : p.stance].eye - p.eyeHeight) * (1 - Math.exp(-10 * dt));
    p.recoilPitch *= Math.exp(-7 * dt);
    cam.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
    cam.rotation.set(p.pitch + p.recoilPitch, p.yaw, 0);
    const w = this.weapons.def;
    const fov = this.settings.fov;
    const targetFov = this.input.aiming && !p.swimming ? (w.zoomFov ?? fov * (w.aimFovScale ?? 0.8)) : sprinting ? fov + 7 : fov;
    this.gfx.setFov(cam.fov + (targetFov - cam.fov) * (1 - Math.exp(-14 * (w.aimSpeed ?? 1) * dt)));

    this.weapons.update(dt, sprinting, !p.swimming);
    if (this.state !== 'playing') return; // a shot may have ended the match
    this.projectiles.update(dt);
    if (this.state !== 'playing') return; // a bullet may have ended the match
    this.mode?.update(dt);
    this.bots.update(dt, true);
    this.fx.update(dt);
    this.hud.update(dt, {
      stance: p.swimming ? 'SWIMMING' : p.stance === 'stand' ? '' : p.stance.toUpperCase(),
      breath: p.breath,
      underwater: p.headUnderwater,
      hp: p.hp,
      weaponName: w.name,
      ammo: this.weapons.ammo,
      magazine: w.magazine,
      reloading: this.weapons.reloading,
      elapsed: this.elapsed,
      spread: this.weapons.spread(),
      fov: cam.fov,
      aiming: this.input.aiming,
      hasScope: !!w.model.scope,
      scoped: this.weapons.isScoped(),
    });
  }

  /** Splashes, ripples, the underwater view and running out of breath. */
  private updateWater(dt: number): void {
    const p = this.player;
    const fall = -p.vel.y;
    if (this.lastSubmerged < 0.04 && p.submerged >= 0.04 && fall > 1.5) {
      const strength = Math.min(1, fall / 9);
      this.waterFx.splash(p.pos, p.waterLevel, strength, p.vel);
      this.audio.splash(strength);
    }
    this.lastSubmerged = p.submerged;
    if (p.submerged > 0.15 && p.horizontalSpeed > 0.4) {
      this.swimTimer -= dt;
      if (this.swimTimer <= 0) {
        this.swimTimer = p.swimming ? 0.85 : 0.45;
        this.waterFx.ripple(p.pos, p.waterLevel, p.swimming ? 1.4 : 0.8);
        if (p.swimming) this.audio.stroke();
      }
    }
    const under = p.headUnderwater;
    this.gfx.setUnderwater(under);
    this.audio.setUnderwater(under);
    if (under) {
      p.breath = Math.max(0, p.breath - dt / BREATH_SECONDS);
      if (p.breath === 0) {
        this.drownTimer -= dt;
        if (this.drownTimer <= 0) {
          this.drownTimer = 1;
          this.hurtPlayer(12, p.pos);
        }
      }
    } else {
      p.breath = Math.min(1, p.breath + dt / 3);
      this.drownTimer = 0;
    }
  }

  /** Noclip: move along the view direction, ignore collision and gravity. */
  private fly(buttons: number, dt: number): void {
    const p = this.player;
    const speed = FLY_SPEED * (hasButton(buttons, Buttons.Sprint) ? 2.5 : 1) * dt;
    const f = (hasButton(buttons, Buttons.Forward) ? 1 : 0) - (hasButton(buttons, Buttons.Back) ? 1 : 0);
    const s = (hasButton(buttons, Buttons.Right) ? 1 : 0) - (hasButton(buttons, Buttons.Left) ? 1 : 0);
    const u = (hasButton(buttons, Buttons.Jump) ? 1 : 0) - (this.input.isDown('KeyQ') ? 1 : 0);
    const cp = Math.cos(p.pitch);
    p.pos.x += (-Math.sin(p.yaw) * cp * f + Math.cos(p.yaw) * s) * speed;
    p.pos.z += (-Math.cos(p.yaw) * cp * f - Math.sin(p.yaw) * s) * speed;
    p.pos.y += (Math.sin(p.pitch) * f + u) * speed;
    p.vel.set(0, 0, 0);
    p.onGround = false;
  }

  /** Slow cinematic orbit over the arena while bots patrol. */
  private updateMenuBackdrop(dt: number): void {
    this.menuTime += dt;
    const a = this.menuTime * 0.06;
    const cam = this.gfx.camera;
    cam.position.set(Math.cos(a) * 34, 13 + Math.sin(this.menuTime * 0.2) * 2, Math.sin(a) * 34);
    this.gfx.setFov(60);
    cam.lookAt(Math.cos(a + 1.2) * 6, 1, Math.sin(a + 1.2) * 6);
    this.bots.update(dt, false);
    this.fx.update(dt);
  }
}
