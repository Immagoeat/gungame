import * as THREE from 'three';
import { applyAttachments, raycastBoxes, type Loadout, type WeaponDef, type WeaponId } from '@gungame/shared';
import type { Game } from '../core/Game';
import { loadouts } from '../core/loadouts';
import { muzzleFlashTexture } from '../world/textures';
import { buildGun, type GunModel } from './gunModels';
import { buildViewArms, type ViewArms } from './viewArms';

/** Where the gun sits when not aiming (camera space). */
const HIP = { pistol: new THREE.Vector3(0.16, -0.17, -0.38), long: new THREE.Vector3(0.15, -0.19, -0.3) };
/** How far in front of the eye the sight sits when aiming, by optic. */
const AIM_DISTANCE: Record<string, number> = { iron: 0.11, reddot: 0.15, holo: 0.15, acog: 0.08, scope8x: 0.06 };
const LASER_RANGE = 60;

/** The player's current weapon: firing, reloading, recoil, attachments and the first-person view model. */
export class WeaponSystem {
  readonly holder = new THREE.Group();
  id: WeaponId = 'pistol';
  def: WeaponDef = applyAttachments('pistol');
  ammo = 0;
  /** Weapons the player carries, in slot order (number keys). */
  private inventory: WeaponId[] = ['pistol'];
  /** Rounds left in each carried weapon's magazine while it's holstered. */
  private readonly mags = new Map<WeaponId, number>();
  private previous: WeaponId | null = null;
  flashlightOn = true;
  private fireCooldown = 0;
  private reloadTimer = 0;
  private autoReloadTimer = 0;
  private switchTimer = 0;
  private kick = 0;
  /** 0 gun up .. 1 lowered for sprinting; the gun can't fire until it's back up. */
  private sprintPose = 0;
  private bobPhase = 0;
  private flashTimer = 0;
  private gun: GunModel | null = null;
  private view: THREE.Group | null = null;
  private arms: ViewArms | null = null;
  private readonly flash: THREE.Sprite;
  private readonly laserBeam: THREE.Line;
  private readonly laserDot: THREE.Mesh;
  private readonly torch: THREE.SpotLight;

  constructor(private readonly game: Game) {
    game.gfx.weaponScene.add(this.holder);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flash.visible = false;

    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.laserBeam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laserBeam.frustumCulled = false;
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    this.torch = new THREE.SpotLight(0xfff4e0, 0, 40, 0.38, 0.45, 1.6);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.torch.shadow.bias = -0.002;
    game.gfx.scene.add(this.laserBeam, this.laserDot, this.torch, this.torch.target);
    this.laserBeam.visible = this.laserDot.visible = false;
  }

  /** Puts the gun straight at the hip hold, still (e.g. before it's first shown after a cutscene). */
  settle(): void {
    const pistol = this.id === 'pistol' || this.id === 'golden';
    this.holder.position.copy(pistol ? HIP.pistol : HIP.long);
    this.holder.rotation.set(0, 0, 0);
    this.holder.updateMatrix();
    if (this.arms?.cameraSpace) this.arms.update(this.holder.matrix);
  }

  /** Shows or hides the first-person gun and arms (hidden in menus). */
  setVisible(visible: boolean): void {
    visible &&= !this.holstered;
    this.holder.visible = visible;
    if (this.arms?.cameraSpace) this.arms.object.visible = visible;
    if (!visible) this.hideAccessories();
  }

  /** Laser beam, laser dot and weapon light off (menus, cutscenes, scoped view). */
  private hideAccessories(): void {
    this.laserBeam.visible = this.laserDot.visible = false;
    this.torch.intensity = 0;
    this.torch.shadow.autoUpdate = false;
  }

  /** The weapon light is on (it makes you much easier to see). */
  get lightOn(): boolean {
    return !!this.def.flashlight && this.flashlightOn && this.holder.visible;
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  get carried(): readonly WeaponId[] {
    return this.inventory;
  }

  /** Carry just this weapon (replacing whatever was carried), drawn with a full magazine. */
  equip(id: WeaponId): void {
    this.setInventory([id]);
  }

  /**
   * No gun at all (undercover, before you've got hold of one): nothing in your hands and nothing to
   * fire. Fists still work for takedowns. Giving a weapon ends it.
   */
  holstered = false;
  /** Fittings a mission puts on a gun it hands you (over the player's own loadout), e.g. a suppressor. */
  private readonly fitted = new Map<WeaponId, Loadout>();

  /** Hands the player a set of weapons, all fully loaded, and draws the first. Empty = unarmed. */
  setInventory(ids: WeaponId[]): void {
    this.fitted.clear();
    if (!ids.length) {
      this.inventory = [];
      this.mags.clear();
      this.previous = null;
      this.holstered = true;
      this.setVisible(false);
      this.game.onWeaponChanged(this.id, this.def);
      return;
    }
    this.holstered = false;
    this.inventory = [...ids];
    this.mags.clear();
    this.previous = null;
    this.draw(this.inventory[0]);
  }

  /** Adds a weapon to what you carry (fully loaded) and draws it. */
  give(id: WeaponId, holstered = false, fittings?: Loadout): void {
    if (fittings) this.fitted.set(id, fittings);
    if (!this.inventory.includes(id)) this.inventory.push(id);
    this.mags.delete(id);
    if (this.id === id) this.draw(id); else this.select(id);
    this.holstered = holstered;
    this.setVisible(!holstered);
    this.game.onWeaponChanged(this.id, this.def);
  }

  /** H: put the gun away (out of sight: undercover, it's what people notice) or draw it again. */
  toggleHolster(): void {
    if (!this.inventory.length) return;
    this.holstered = !this.holstered;
    if (!this.holstered) {
      this.setVisible(true);
      this.switchTimer = 0.45; // drawing takes a moment
    } else this.setVisible(false);
    this.game.audio.beep(this.holstered ? 520 : 760, 0.03, 'triangle', 0.03);
    this.game.onWeaponChanged(this.id, this.def);
  }

  /** Switches to a carried weapon. Its magazine is as you left it. */
  select(id: WeaponId): void {
    if (id === this.id || !this.inventory.includes(id)) return;
    this.mags.set(this.id, this.ammo);
    this.previous = this.id;
    this.draw(id);
  }

  /** Number keys: slot 0 is the first carried weapon. */
  selectSlot(slot: number): void {
    const id = this.inventory[slot];
    if (id && this.holstered) this.toggleHolster();
    if (id) this.select(id);
  }

  /** Mouse wheel: next (+1) or previous (-1) carried weapon, wrapping round. */
  cycle(dir: 1 | -1): void {
    const n = this.inventory.length;
    if (n < 2) return;
    const i = this.inventory.indexOf(this.id);
    this.select(this.inventory[(i + dir + n) % n]);
  }

  /** Quick swap back to the last weapon used. */
  swapToPrevious(): void {
    if (this.previous) this.select(this.previous);
  }

  /** Puts a weapon in your hands with the player's saved attachments. */
  private draw(id: WeaponId): void {
    this.id = id;
    this.def = applyAttachments(id, { ...loadouts.get(id), ...this.fitted.get(id) });
    this.ammo = Math.min(this.mags.get(id) ?? this.def.magazine, this.def.magazine);
    this.rebuildModel();
    this.reloadTimer = this.fireCooldown = this.autoReloadTimer = 0;
    this.switchTimer = 0.45;
  }

  /** Re-applies attachments after they change in the armory, keeping the current weapon. */
  refreshLoadout(): void {
    this.def = applyAttachments(this.id, { ...loadouts.get(this.id), ...this.fitted.get(this.id) });
    this.rebuildModel();
    this.ammo = Math.min(this.ammo, this.def.magazine);
  }

  private rebuildModel(): void {
    if (this.view) {
      this.holder.remove(this.view);
      this.gun?.dispose();
    }
    if (this.arms?.cameraSpace) this.arms.object.removeFromParent();
    this.gun = buildGun(this.id, this.def.loadout);
    this.view = new THREE.Group();
    this.view.add(this.gun.group);
    const pistol = this.id === 'pistol' || this.id === 'golden';
    this.arms = buildViewArms(this.gun, this.id, new THREE.Matrix4().makeTranslation(pistol ? HIP.pistol : HIP.long));
    if (this.arms.cameraSpace) {
      this.arms.object.visible = this.holder.visible;
      this.game.gfx.weaponScene.add(this.arms.object);
    }
    else this.view.add(this.arms.object);
    this.view.add(this.flash);
    this.flash.position.copy(this.gun.muzzle);
    this.holder.add(this.view);
    this.game.onWeaponChanged(this.id, this.def);
  }

  startReload(): void {
    if (this.holstered) return;
    if (this.reloadTimer > 0 || this.ammo === this.def.magazine || this.switchTimer > 0) return;
    this.reloadTimer = this.def.reloadTime;
    this.game.audio.beep(500, 0.05, 'square', 0.05);
    this.game.audio.beep(350, 0.05, 'square', 0.05, 0.12);
  }

  toggleFlashlight(): void {
    if (this.holstered || !this.def.flashlight) return;
    this.flashlightOn = !this.flashlightOn;
    this.game.audio.beep(this.flashlightOn ? 1800 : 1200, 0.03, 'square', 0.04);
  }

  /** A bipod steadies the gun when you get low. */
  private get braced(): boolean {
    return !!this.def.bipod && this.game.player.stance !== 'stand';
  }

  /** Current cone half-angle including movement and airborne penalties. */
  spread(): number {
    const p = this.game.player;
    const aiming = this.game.input.aiming;
    const steady = (p.stance === 'prone' ? 0.45 : p.stance === 'crouch' ? 0.7 : 1) * (this.braced ? 0.6 : 1);
    return ((aiming ? this.def.spreadAim : this.def.spreadHip) +
      p.horizontalSpeed * (aiming ? 0.002 : 0.004) + (p.onGround || p.swimming ? 0 : 0.04)) * steady;
  }

  /** Looking through a magnified optic: show the scope overlay instead of the gun. */
  isScoped(): boolean {
    const zoom = this.def.zoomFov;
    return !!this.gun?.magnified && zoom !== undefined && this.game.input.aiming && this.game.gfx.camera.fov < zoom + 6;
  }

  /** @param canFire false while swimming: the gun is held out of the water. */
  update(dt: number, sprinting: boolean, canFire = true): void {
    const input = this.game.input;
    if (this.holstered) {
      input.wantFire = false;
      this.holder.visible = false;
      if (this.arms?.cameraSpace) this.arms.object.visible = false;
      this.hideAccessories();
      return;
    }
    this.fireCooldown -= dt;
    if (this.switchTimer > 0) this.switchTimer -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.def.magazine;
        this.game.audio.beep(700, 0.05, 'square', 0.05);
      }
    }
    if (this.autoReloadTimer > 0) {
      this.autoReloadTimer -= dt;
      if (this.autoReloadTimer <= 0 && this.ammo === 0) this.startReload();
    }
    this.sprintPose += ((sprinting ? 1 : 0) - this.sprintPose) * (1 - Math.exp(-14 * dt));
    const trigger = this.def.automatic ? input.mouseHeld : input.wantFire;
    if (!canFire) input.wantFire = false;
    if (canFire && trigger && !sprinting && this.sprintPose < 0.2 && this.fireCooldown <= 0 && this.reloadTimer <= 0 && this.switchTimer <= 0) {
      if (this.ammo > 0) this.fire();
      else {
        this.game.audio.beep(220, 0.04, 'square', 0.05);
        this.startReload();
      }
      input.wantFire = false;
    }
    this.updateViewModel(dt, !canFire);
    this.updateAccessories(!canFire);
  }

  private fire(): void {
    const g = this.game;
    const w = this.def;
    const cam = g.gfx.camera;
    this.fireCooldown = w.fireInterval;
    this.ammo--;

    const spread = this.spread();
    cam.updateMatrixWorld();
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const scoped = this.isScoped();
    const muzzleWorld = scoped
      ? origin.clone().addScaledVector(up, -0.15)
      : cam.localToWorld(this.holder.position.clone().add(this.gun!.muzzle));
    for (let p = 0; p < w.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      g.projectiles.fire(origin, dir, w, muzzleWorld);
    }

    const recoil = w.recoil * (g.input.aiming ? 0.6 : 1) * (this.braced ? 0.5 : 1);
    g.player.recoilPitch += recoil;
    g.player.yaw += (Math.random() - 0.5) * recoil * 0.4;
    this.kick = 1;
    const showFlash = w.flash !== false;
    this.flashTimer = 0.045;
    this.flash.visible = showFlash && !scoped;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar(w.pellets > 1 || w.zoomFov ? 0.3 : 0.2);
    g.gfx.flashLight.intensity = showFlash ? 40 : 4;
    const loud = w.loudness ?? 1;
    g.actors?.noise(origin, loud < 0.5 ? 7 : 48, 'gunshot');
    g.audio.shot(loud < 0.5 ? { cutoff: w.sound.cutoff * 0.35, decay: w.sound.decay * 0.6 } : w.sound, loud);
    if (this.ammo === 0) this.autoReloadTimer = 0.25;
  }

  private updateViewModel(dt: number, lowered = false): void {
    const g = this.game;
    const w = this.def;
    const p = g.player;
    const aiming = g.input.aiming && !lowered;
    const speed = p.horizontalSpeed;
    if (p.onGround) this.bobPhase += dt * speed * 1.6;
    this.kick *= Math.exp(-18 * dt);

    const pistol = this.id === 'pistol' || this.id === 'golden';
    let base: THREE.Vector3;
    if (aiming && this.gun) {
      // Put the sight on the line of sight, a little in front of the eye.
      const dist = AIM_DISTANCE[w.loadout?.optic ?? 'iron'] ?? 0.2;
      base = new THREE.Vector3(0, 0, -dist - (pistol ? 0.2 : 0)).sub(this.gun.sight);
    } else {
      base = (pistol ? HIP.pistol : HIP.long).clone();
    }
    const bob = aiming ? 0.001 : 0.01 * Math.min(1, speed / 6);
    const target = new THREE.Vector3(
      base.x + Math.sin(this.bobPhase) * bob,
      base.y + Math.abs(Math.cos(this.bobPhase)) * bob - (this.switchTimer > 0 ? this.switchTimer * 0.6 : 0) - (lowered ? 0.35 : 0),
      base.z + this.kick * (pistol ? 0.03 : 0.045),
    );
    this.holder.position.lerp(target, 1 - Math.exp(-18 * (w.aimSpeed ?? 1) * dt));
    const reloadTilt = this.reloadTimer > 0
      ? Math.sin(Math.min(1, 1 - this.reloadTimer / w.reloadTime) * Math.PI) * 0.9
      : 0;
    this.holder.rotation.set(this.kick * (aiming ? 0.04 : 0.1) - reloadTilt * 0.5, this.sprintPose * 0.6, reloadTilt * 0.6 + this.sprintPose * 0.2);
    this.setVisible(!this.isScoped());
    if (this.arms?.cameraSpace) {
      this.holder.updateMatrix();
      this.arms.update(this.holder.matrix);
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    g.gfx.flashLight.position.copy(g.gfx.camera.position);
    g.gfx.flashLight.intensity *= Math.exp(-40 * dt);
  }

  /** Laser beam and dot, weapon light: placed in the world from the gun's emitters. */
  private updateAccessories(lowered: boolean): void {
    const g = this.game;
    const cam = g.gfx.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const emitter = (local: THREE.Vector3) => cam.localToWorld(local.clone().applyEuler(this.holder.rotation).add(this.holder.position));

    const laserOn = !!this.def.laser && !!this.gun?.laser && !lowered && g.state === 'playing';
    this.laserBeam.visible = this.laserDot.visible = laserOn;
    if (laserOn) {
      const from = emitter(this.gun!.laser!);
      // Converge on the crosshair 15 m out, like a zeroed laser.
      const dir = cam.position.clone().addScaledVector(fwd, 15).sub(from).normalize();
      const hit = raycastBoxes(from, dir, LASER_RANGE, g.world.colliders)[0];
      const end = from.clone().addScaledVector(dir, hit ? hit.tIn : LASER_RANGE);
      const pos = this.laserBeam.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, end.x, end.y, end.z);
      pos.needsUpdate = true;
      this.laserDot.position.copy(end).addScaledVector(dir, -0.01);
      this.laserDot.visible = !!hit;
    }

    const lightOn = !!this.def.flashlight && !!this.gun?.light && this.flashlightOn && g.state === 'playing';
    this.torch.intensity = lightOn ? 70 : 0;
    this.torch.shadow.autoUpdate = lightOn; // no shadow rendering while it's off
    if (lightOn) {
      this.torch.position.copy(emitter(this.gun!.light!));
      this.torch.target.position.copy(cam.position).addScaledVector(fwd, 12);
    }
  }
}
