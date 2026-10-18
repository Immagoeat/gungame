import * as THREE from 'three';
import {
  Buttons, clamp, createMap, WEAPONS, hasButton, isSprinting, STANCES, stepMovement, type MapId, type Vec3, type WeaponDef, type WeaponId,
} from '@gungame/shared';
import { BotManager } from '../entities/BotManager';
import type { Bot } from '../entities/Bot';
import { BREATH_SECONDS, Player } from '../entities/Player';
import { createAvatar, type AvatarState } from '../entities/avatar';
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
import { LAYER_CCTV_ONLY, LAYER_EFFECTS, LAYER_SHADOW_PROXY } from './layers';
import type { Cutscene } from '../cutscenes/Cutscene';
import { CutsceneOverlay } from '../ui/CutsceneOverlay';
import { LoadingScreen } from '../ui/LoadingScreen';
import type { WorldActors } from './actors';
import type { PartyMusic } from '../audio/PartyMusic';
import { LAYER_SCREENS, type SecurityCam } from '../world/SecuritySystem';
import { PartySystem } from '../world/PartySystem';
import { World } from '../world/World';
import { characterLook } from './characterLook';
import type { CivilianStyle } from '../entities/character/soldierOutfit';
import { VoicePlayer } from '../audio/Voice';
import { AudioSystem } from './Audio';
import { Graphics } from './Graphics';
import { Input } from './Input';
import { loadSettings } from './Settings';
import { progress } from './progress';

/**
 * - menu: main menu with the arena orbiting behind it
 * - loading: building a match behind the loading screen
 * - starting: match set up, waiting for pointer lock
 * - cutscene: a scripted intro is playing (Space, Enter or a click skips it)
 * - playing / paused / over: in a match
 */
export type GameState = 'menu' | 'loading' | 'starting' | 'cutscene' | 'playing' | 'paused' | 'over';

const BASE_SENSITIVITY = 0.0022;
const REGEN_DELAY = 4;
const REGEN_PER_SECOND = 20;
const KILL_HEAL = 15;
const MENU_BACKDROP_BOTS = 7;
const MENU_MAP: MapId = 'arena';
const FLY_SPEED = 10;
/** Seconds to hold Space to skip a cutscene. */
const SKIP_HOLD = 0.9;

/** The engine: owns every system and the state machine. Rules live in the active GameMode. */
export class Game {
  readonly settings = loadSettings();
  readonly gfx: Graphics;
  readonly audio: AudioSystem;
  /** Spoken lines with their subtitles (audio loads in the background). */
  readonly voice: VoicePlayer;
  readonly input: Input;
  world: World;
  readonly player = new Player();
  private avatar = createAvatar();
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
  private cutscene: Cutscene | null = null;
  private pickupTarget: { weapon: WeaponId; name: string } | null = null;
  /** Guards, hostages etc. the active mission put in the world. */
  actors: WorldActors | null = null;
  private stepTimer = 0;
  /** Music playing from a point in the world (the party's DJ booth), and where it comes from. */
  private music: PartyMusic | null = null;
  private readonly musicSource = new THREE.Vector3();
  private musicBlocked = false;
  private musicCheck = 0;
  private cutsceneActor: AvatarState | null = null;
  private cutsceneFirstPerson = false;
  private cutsceneTime = 0;
  private readonly cutsceneUi = new CutsceneOverlay();
  /** How long the skip key has been held during a cutscene. */
  private skipHold = 0;
  private readonly loadingUi = new LoadingScreen();
  /** Bumped by every new load (and by quitting), so a superseded load stops where it is. */
  private loadToken = 0;
  private ambience: { set(level: number, below?: number): void; stop(): void } | null = null;
  private tinkleBudget = 0;

  constructor(container: HTMLElement) {
    this.gfx = new Graphics(container, this.settings.quality);
    this.audio = new AudioSystem(this.settings.volume);
    this.voice = new VoicePlayer(this.audio);
    this.audio.setMusicVolume(this.settings.music);
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
      if (this.mode?.key?.(code)) return;
      if (code === 'KeyR') this.weapons.startReload();
      if (code === 'KeyF') this.weapons.toggleFlashlight();
      if (code === 'KeyH') this.weapons.toggleHolster();
      if (/^Digit[1-9]$/.test(code)) this.weapons.selectSlot(Number(code.slice(5)) - 1);
      if (code === 'KeyQ') this.weapons.swapToPrevious();
      if (code === 'KeyE') this.interact();
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
    // Build the party guests' bodies in the background while the menu is up.
    PartySystem.prewarm(createMap('mansion').props);
    PartySystem.prewarm(createMap('aurelia').props);
    void this.voice.preload();
    this.gfx.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Match flow ----------

  get difficulty() {
    return this.options.difficulty;
  }

  /**
   * Loads and starts a match behind the loading screen: builds the map, sets up the mode and its
   * intro, compiles shaders and renders a warm-up frame, then waits for a click (which also captures
   * the mouse) before starting.
   */
  async startMatch(options: MatchOptions): Promise<void> {
    const token = ++this.loadToken;
    this.audio.init();
    this.endCutscene(false);
    this.stopAmbience();
    this.mode?.dispose();
    this.options = options;
    const mode = createMode(this, options);
    this.mode = mode;
    this.state = 'loading';
    this.input.unlock();
    this.input.clearActions();
    this.menu.hide();
    this.hud.hide();
    this.weapons.setVisible(false);
    this.loadingUi.show(mode.loadingInfo?.() ?? { kicker: '', title: 'LOADING', description: '' });
    const paint = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const cancelled = () => token !== this.loadToken;
    await paint();
    if (cancelled()) return;

    this.loadingUi.progress(0.08, 'Building the world');
    await paint();
    this.loadMap(mode.mapId, true, false); // fresh copy: broken glass and cameras come back
    if (cancelled()) return;
    this.bots.clear();
    this.fx.clear();
    this.hud.reset();
    this.projectiles.clear();
    this.gfx.setTimeOfDay(this.world.map.timeOfDay ?? 15);
    this.player.reset(this.world.map.playerSpawn, this.world.map.spawnYaw);
    this.player.floor = this.world.map.noGround ? -Infinity : 0;
    this.world.doors.inTheWay = box => {
      const p = this.player, r = p.radius;
      return p.pos.x + r > box.min.x && p.pos.x - r < box.max.x && p.pos.z + r > box.min.z && p.pos.z - r < box.max.z &&
        p.pos.y + p.height > box.min.y && p.pos.y < box.max.y;
    };
    this.input.stance = 'stand';
    this.waterFx.clear();
    this.gfx.setUnderwater(false);
    this.audio.setUnderwater(false);
    this.flying = false;
    this.elapsed = 0;
    this.gfx.setFov(this.settings.fov);

    this.loadingUi.progress(0.45, 'Setting the scene');
    await paint();
    mode.start();
    this.weapons.setVisible(false);
    const intro = mode.intro?.() ?? null;
    if (cancelled()) { intro?.dispose(); return; }

    this.loadingUi.progress(0.6, 'Compiling shaders');
    await paint();
    await this.gfx.compileScene();
    if (cancelled()) { intro?.dispose(); return; }

    // Warm-up: render the opening shot once behind the loading screen, so shadows, lights and any
    // remaining shaders are ready before anything is shown.
    this.loadingUi.progress(0.9, 'Lighting');
    await paint();
    if (intro) this.previewCutscene(intro);
    else this.placeCamera();
    this.world.update(0, this.gfx.night);
    this.gfx.render();
    if (cancelled()) { intro?.dispose(); return; }

    this.loadingUi.progress(1, 'Ready');
    await this.loadingUi.waitForContinue();
    if (cancelled()) { intro?.dispose(); return; }
    this.loadingUi.hide();
    this.startAmbience();
    this.input.lock();
    this.clock.getDelta();
    if (intro) this.beginCutscene(intro);
    else {
      this.weapons.setVisible(true);
      this.state = 'starting';
    }
  }

  restartMatch(): void {
    this.startMatch(this.options);
  }

  resume(): void {
    this.input.lock();
  }

  goToMainMenu(): void {
    this.loadToken++;
    this.loadingUi.cancel();
    this.endCutscene(false);
    this.stopAmbience();
    this.voice.stopRadio();
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

  /** What "retry" restarts from (a mission checkpoint), or undefined for the start. */
  setCheckpoint(checkpoint: unknown): void {
    this.options = { ...this.options, checkpoint };
  }

  /** Stops the party music (when the party breaks up). */
  stopMusic(): void {
    this.music?.stop();
    this.music = null;
  }

  /** Called by the active mode when the match is decided. */
  endMatch(result: MatchResult): void {
    this.state = 'over';
    this.input.clearActions();
    this.input.unlock();
    this.hud.hide();
    this.menu.showResults(result);
  }

  private loadMap(id: MapId, force = false, compile = true): void {
    if (!force && this.world.map.id === id) return;
    this.projectiles.clear();
    this.bots.clear();
    this.fx.clear();
    this.debris.clear();
    this.world.dispose();
    this.world = new World(createMap(id), this.gfx.scene);
    this.gfx.prepare(this.world.root, compile);
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

  /** E: pick up the weapon you're looking at. Finding a weapon unlocks it for good. */
  private interact(): void {
    if (this.mode?.interact?.()) return;
    const t = this.pickupTarget;
    if (!t) return;
    this.world.pickups.take(t.weapon);
    this.pickupTarget = null;
    this.hud.prompt('');
    this.weapons.give(t.weapon);
    this.audio.pickup();
    const fresh = progress.unlock(t.weapon);
    this.hud.banner(t.name, fresh ? 'Unlocked: now available in the Armory' : 'Picked up');
  }

  // ---------- Music ----------

  /** Party music if the map has a DJ booth, and night ambience after dark. */
  private startAmbience(): void {
    this.stopAmbience();
    const booth = this.world.map.props.find(p => p.kind === 'furniture' && p.type === 'djBooth');
    if (booth) {
      this.musicSource.set(booth.x, booth.y + 1.6, booth.z);
      this.music = this.audio.partyMusic();
      this.musicCheck = 0;
    }
    if (this.world.map.backdrop === 'openSea') this.ambience = this.audio.seaAmbience();
    else if (this.world.map.backdrop === 'harbour') this.ambience = this.audio.harbourAmbience();
    else if (this.gfx.night > 0.5) this.ambience = this.audio.nightAmbience();
  }

  private stopAmbience(): void {
    this.music?.stop();
    this.music = null;
    this.ambience?.stop();
    this.ambience = null;
  }

  /** Volume, panning and muffling from where the camera is relative to the speakers. */
  private updateMusic(dt: number): void {
    if (!this.music) {
      this.setAmbience(this.state === 'paused' || this.state === 'over');
      return;
    }
    const music = this.music;
    const cam = this.gfx.camera;
    const to = this.musicSource.clone().sub(cam.position);
    const distance = to.length();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const side = distance > 0.01 ? to.normalize().dot(right) : 0;
    // Line of sight is a raycast, so check it a few times a second.
    this.musicCheck -= dt;
    if (this.musicCheck <= 0) {
      this.musicCheck = 0.2;
      this.musicBlocked = !this.world.hasLineOfSight(cam.position, this.musicSource);
    }
    const away = this.state === 'paused' || this.state === 'over';
    music.setListener(distance, side, this.musicBlocked, away);
    this.setAmbience(away);
  }

  /** Crickets (or wind and sea) outside; faint indoors; the engines below decks on a ship. */
  private setAmbience(away: boolean): void {
    const cam = this.gfx.camera;
    const zone = this.world.zoneAt({ x: cam.position.x, y: cam.position.y, z: cam.position.z });
    const outdoors = !zone || /grounds|roof|outside/i.test(zone.floor) || /terrace|balcony|deck|promenade|walkway|yard|quay|compound|^terminal$|car park|road|reefer|staff gate|truck gate/i.test(zone.name);
    const below = zone && /^Deck 2/.test(zone.floor) ? 1 : 0;
    this.ambience?.set((outdoors ? 0.55 : below ? 0.4 : 0.12) * (away ? 0.4 : 1), below);
  }

  // ---------- Cutscenes ----------

  private beginCutscene(scene: Cutscene): void {
    this.cutscene = scene;
    this.cutsceneTime = 0;
    this.skipHold = 0;
    this.cutsceneFirstPerson = false;
    this.state = 'cutscene';
    this.menu.hide();
    this.hud.hide();
    this.weapons.setVisible(false);
    // The player's body is normally only seen by security cameras; here it's the star.
    this.gfx.camera.layers.enable(LAYER_CCTV_ONLY);
    this.cutsceneUi.show();
  }

  /**
   * A closing scene at the end of a mission: plays like an intro (skippable), then `then` runs
   * (which normally ends the match).
   */
  playOutro(scene: Cutscene, then: () => void): void {
    this.outroThen = then;
    this.hud.hide();
    this.beginCutscene(scene);
  }
  private outroThen: (() => void) | null = null;

  private skipCutscene(): void {
    if (this.cutscene) this.cutsceneTime = this.cutscene.duration;
    this.voice.stopRadio();
    this.input.jumpBlocked = true; // the Space that skipped mustn't also jump
  }

  /** Poses the world at the start of a cutscene without starting it (for the loading warm-up). */
  private previewCutscene(scene: Cutscene): void {
    const f = scene.update(0, 0);
    const cam = this.gfx.camera;
    cam.position.copy(f.camera.position);
    cam.lookAt(f.camera.target);
    this.gfx.setFov(f.camera.fov);
    this.gfx.camera.layers.enable(LAYER_CCTV_ONLY);
    if (f.actor) this.avatar.update(0, f.actor);
  }

  /** First-person camera at the player's eyes. */
  private placeCamera(): void {
    const p = this.player;
    this.gfx.camera.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
    this.gfx.camera.rotation.set(p.pitch, p.yaw, 0);
  }

  private updateCutscene(dt: number): void {
    const scene = this.cutscene!;
    // Hold Space or Enter to skip (a tap won't skip by accident).
    const held = this.input.isDown('Space') || this.input.isDown('Enter') || this.input.isDown('NumpadEnter');
    this.skipHold = held ? this.skipHold + dt : Math.max(0, this.skipHold - dt * 3);
    this.cutsceneUi.setSkip(this.skipHold / SKIP_HOLD);
    if (this.skipHold >= SKIP_HOLD) {
      this.skipHold = 0;
      this.skipCutscene();
    }
    this.input.wantFire = false;
    this.cutsceneTime = Math.min(scene.duration, this.cutsceneTime + dt);
    const f = scene.update(dt, this.cutsceneTime);
    const cam = this.gfx.camera;
    cam.position.copy(f.camera.position);
    cam.lookAt(f.camera.target);
    this.gfx.setFov(f.camera.fov);
    this.cutsceneUi.update(f);
    this.cutsceneActor = f.actor;
    // The last beat of an intro can be through your own eyes, gun in hand.
    if (f.firstPerson !== this.cutsceneFirstPerson) {
      this.cutsceneFirstPerson = !!f.firstPerson;
      if (this.cutsceneFirstPerson) this.weapons.settle();
      this.weapons.setVisible(this.cutsceneFirstPerson);
    }
    if (this.cutsceneTime >= scene.duration) this.endCutscene(true);
  }

  /** Hands control to the player where the scene left them (or just tears it down). */
  private endCutscene(handOver: boolean): void {
    const scene = this.cutscene;
    if (!scene) return;
    this.cutscene = null;
    this.cutsceneActor = null;
    this.gfx.camera.layers.disable(LAYER_CCTV_ONLY);
    this.cutsceneUi.hide();
    const outro = this.outroThen;
    this.outroThen = null;
    if (outro) {
      scene.finish();
      scene.dispose();
      if (handOver) outro();
      return;
    }
    if (!handOver) return;
    scene.finish();
    const p = this.player;
    p.pos.copy(scene.end.pos);
    p.vel.set(0, 0, 0);
    p.yaw = scene.end.yaw;
    p.pitch = scene.end.pitch;
    this.gfx.setFov(this.settings.fov);
    this.weapons.setVisible(true);
    this.input.clearActions();
    this.clock.getDelta();
    this.mode?.onIntroDone?.();
    if (this.input.locked) {
      this.state = 'playing';
      this.hud.show();
    } else {
      // Pointer lock was refused or released: ask for a click to start.
      this.state = 'starting';
      this.pause();
    }
  }

  private pause(): void {
    this.state = 'paused';
    this.input.clearActions();
    this.menu.showPause(this.mode?.pauseInfo() ?? '', this.mode?.pauseDetails?.() ?? '');
  }

  private onPointerLockChange(locked: boolean): void {
    if (locked && (this.state === 'starting' || this.state === 'paused')) {
      this.menu.hide();
      this.clock.getDelta(); // don't count time spent in menus
      if (this.cutscene) {
        this.state = 'cutscene';
        this.cutsceneUi.show();
        return;
      }
      this.state = 'playing';
      this.hud.show();
    } else if (!locked && (this.state === 'playing' || this.state === 'cutscene')) {
      if (this.cutscene) this.cutsceneUi.hide();
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
    this.actors?.noise(point, 18, 'glass');
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

  /** Undercover clothes over the player's look (null: their own kit). Rebuilds body and arms. */
  setOutfit(outfit: CivilianStyle | null): void {
    characterLook.outfit = outfit;
    this.onLookChanged();
  }

  /** The player changed their character's look: rebuild the body and the first-person arms. */
  onLookChanged(): void {
    this.gfx.scene.remove(this.avatar.group);
    this.avatar = createAvatar();
    this.gfx.scene.add(this.avatar.group);
    this.weapons.refreshLoadout();
  }

  /** The equipped weapon (or its attachments) changed: the body holds the same gun. */
  onWeaponChanged(id: WeaponId, def: WeaponDef): void {
    if (this.weapons?.holstered) this.avatar?.clearWeapon?.();
    else this.avatar?.setWeapon(id, def.loadout ?? {});
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
    // The loading screen covers everything; the loader renders its own warm-up frame.
    if (this.state === 'loading') return;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'cutscene') { this.updateCutscene(dt); this.mode?.scenery?.(dt); }
    else if (this.state === 'menu') this.updateMenuBackdrop(dt);
    if (this.state === 'playing' || this.state === 'menu' || this.state === 'cutscene') {
      this.world.update(dt, this.gfx.night, this.gfx.camera.position);
      this.tinkleBudget = Math.min(6, this.tinkleBudget + dt * 20);
      this.debris.update(dt);
      this.waterFx.update(dt);
    }
    const p = this.player;
    if (this.cutscene) {
      // The scene drives the body (hidden while it's out of shot).
      this.avatar.group.visible = !!this.cutsceneActor;
      if (this.cutsceneActor) this.avatar.update(dt, this.cutsceneActor);
    } else {
      this.avatar.group.visible = this.state !== 'menu' && !this.flying;
      this.avatar.update(dt, {
        pos: p.pos, yaw: p.yaw, pitch: p.pitch, stance: p.stance, eyeHeight: p.eyeHeight, speed: p.horizontalSpeed,
        forward: -Math.sin(p.yaw) * p.vel.x - Math.cos(p.yaw) * p.vel.z,
        swimming: p.swimming, onGround: p.onGround, aiming: this.input.aiming,
        gunOffset: this.weapons.holder.position, gunRotation: this.weapons.holder.quaternion,
      });
    }
    this.updateMusic(dt);
    {
      const c = this.gfx.camera;
      const r = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
      Object.assign(this.audio.listener.pos, { x: c.position.x, y: c.position.y, z: c.position.z });
      Object.assign(this.audio.listener.right, { x: r.x, y: r.y, z: r.z });
    }
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
    else {
      const falling = p.onGround ? 0 : -p.vel.y;
      stepMovement(p, { buttons, yaw: p.yaw }, dt, this.world.colliders, this.world.water);
      // Landing from a jump or a drop: a heavier footfall (and the next step a beat later).
      if (falling > 4 && p.onGround && !p.swimming && this.state === 'playing') {
        this.audio.step(this.world.surfaceAt(p.pos), Math.min(1.4, falling / 7));
        this.stepTimer = 0.3;
      }
    }
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
    // What you're looking at that you can use.
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.pickupTarget = this.world.pickups.target(cam.position, look);
    const modePrompt = this.mode?.prompt?.() ?? null;
    this.hud.prompt(modePrompt ?? (this.pickupTarget ? `<kbd>E</kbd>Pick up ${escapeHtml(this.pickupTarget.name)}` : ''));
    // Footsteps: you hear your own on whatever's underfoot. They carry to the guards too: sprinting
    // is loud, walking quiet, crouching and crawling silent (and only just audible to you).
    if (p.onGround && !p.swimming && p.horizontalSpeed > 1) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        const standing = p.stance === 'stand';
        this.stepTimer = !standing ? 0.6 : sprinting ? 0.32 : p.horizontalSpeed < 4 ? 0.52 : 0.42;
        this.audio.step(this.world.surfaceAt(p.pos), !standing ? 0.18 : sprinting ? 1 : 0.6);
        if (standing) this.actors?.noise(new THREE.Vector3(p.pos.x, p.pos.y + 0.2, p.pos.z), sprinting ? 8 : 2.5, 'footsteps');
      }
    } else this.stepTimer = Math.min(this.stepTimer, 0.12);
    this.bots.update(dt, true);
    this.fx.update(dt);
    this.hud.update(dt, {
      stance: p.swimming ? 'SWIMMING' : p.stance === 'stand' ? '' : p.stance.toUpperCase(),
      breath: p.breath,
      underwater: p.headUnderwater,
      hp: p.hp,
      weaponName: !this.weapons.holstered ? w.name : this.weapons.carried.length ? `${w.name} · holstered` : 'Unarmed',
      ammo: this.weapons.holstered && !this.weapons.carried.length ? -1 : this.weapons.ammo,
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
