import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  applyAttachments, attachmentsFor, getAttachment, SLOT_NAMES, WEAPON_SLOTS, WEAPONS,
  type Slot, type WeaponDef, type WeaponId,
} from '@gungame/shared';
import type { Game } from '../core/Game';
import { loadouts } from '../core/loadouts';
import { buildGun, type GunModel } from '../weapons/gunModels';
import { $, escapeHtml } from './dom';

const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'golden'];

/** Stat bars: label, value from a weapon (0..1, higher is better), formatted raw value. */
const STATS: [string, (w: WeaponDef) => number, (w: WeaponDef) => string][] = [
  ['Damage', w => w.damage * w.pellets / 160, w => `${Math.round(w.damage)}${w.pellets > 1 ? ` ×${w.pellets}` : ''}`],
  ['Accuracy', w => 1 - w.spreadAim / 0.07, w => `${(w.spreadAim * 1000).toFixed(0)} mrad`],
  ['Hip fire', w => 1 - w.spreadHip / 0.1, w => `${(w.spreadHip * 1000).toFixed(0)} mrad`],
  ['Recoil control', w => 1 - w.recoil / 0.1, w => `${(w.recoil * 1000).toFixed(0)}`],
  ['Velocity', w => w.muzzleVelocity / 1150, w => `${Math.round(w.muzzleVelocity)} m/s`],
  ['Capacity', w => w.magazine / 80, w => `${w.magazine}`],
  ['Reload speed', w => 1 - w.reloadTime / 3.5, w => `${w.reloadTime.toFixed(2)} s`],
  ['Handling', w => (w.aimSpeed ?? 1) / 1.4, w => `${Math.round((w.aimSpeed ?? 1) * 100)}%`],
];

/** Weapon customization screen with a live 3D preview. */
export class Armory {
  private weapon: WeaponId = 'rifle';
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.01, 20);
  private readonly turntable = new THREE.Group();
  private gun: GunModel | null = null;
  private running = false;
  private spin = 0.6;
  private dragging = false;
  private lastX = 0;
  private openSlot: Slot | null = null;

  constructor(private readonly game: Game) {
    this.scene.add(this.turntable);
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(2, 3, 2);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.5);
    rim.position.set(-2, 1, -2);
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.3));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.6, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.22;
    this.scene.add(floor);
    this.camera.position.set(0, 0.25, 1.75);
    this.camera.lookAt(0, -0.02, 0);

    const canvas = $<HTMLCanvasElement>('armoryCanvas');
    canvas.addEventListener('pointerdown', e => { this.dragging = true; this.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.turntable.rotation.y += (e.clientX - this.lastX) * 0.01;
      this.lastX = e.clientX;
    });
  }

  open(weapon: WeaponId): void {
    this.weapon = weapon;
    if (!this.renderer) {
      const canvas = $<HTMLCanvasElement>('armoryCanvas');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    this.render();
    if (!this.running) {
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        this.resize();
        if (!this.dragging) this.turntable.rotation.y += 0.004 * this.spin;
        this.renderer!.render(this.scene, this.camera);
        requestAnimationFrame(loop);
      };
      loop();
    }
  }

  close(): void {
    this.running = false;
  }

  private resize(): void {
    const canvas = this.renderer!.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.floor(w * devicePixelRatio) || canvas.height !== Math.floor(h * devicePixelRatio))) {
      this.renderer!.setPixelRatio(devicePixelRatio);
      this.renderer!.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Rebuilds the preview model, tabs, slots and stats for the current weapon. */
  private render(): void {
    const loadout = loadouts.get(this.weapon);
    const def = applyAttachments(this.weapon, loadout);
    const stock = applyAttachments(this.weapon);

    if (this.gun) {
      this.turntable.remove(this.gun.group);
      this.gun.dispose();
    }
    this.gun = buildGun(this.weapon, loadout);
    // Centre and scale the gun so every weapon fills the stage.
    const box = new THREE.Box3().setFromObject(this.gun.group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.05 / Math.max(size.x, size.y, size.z);
    this.gun.group.scale.setScalar(scale);
    this.gun.group.position.copy(center).multiplyScalar(-scale);
    this.gun.group.rotation.y = 0;
    this.turntable.add(this.gun.group);

    $('weaponTabs').innerHTML = WEAPON_ORDER.map(id =>
      `<button class="tab${id === this.weapon ? ' active' : ''}" data-weapon="${id}">${escapeHtml(WEAPONS[id].name)}</button>`).join('');
    $('weaponTabs').querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b => b.addEventListener('click', () => {
      this.weapon = b.dataset.weapon as WeaponId;
      this.openSlot = null;
      this.render();
    }));
    $('armoryName').textContent = def.name;

    $('armoryStats').innerHTML = STATS.map(([label, value, fmt]) => {
      const v = Math.max(0.02, Math.min(1, value(def)));
      const base = Math.max(0.02, Math.min(1, value(stock)));
      const delta = v - base;
      const cls = Math.abs(delta) < 0.005 ? '' : delta > 0 ? 'up' : 'down';
      return `<div class="stat"><span class="label">${label}</span>
        <div class="bar"><div class="base" style="width:${Math.min(v, base) * 100}%"></div>
        <div class="delta ${cls}" style="left:${Math.min(v, base) * 100}%;width:${Math.abs(delta) * 100}%"></div></div>
        <span class="val ${cls}">${fmt(def)}</span></div>`;
    }).join('');

    $('armorySlots').innerHTML = WEAPON_SLOTS[this.weapon].map(slot => {
      const current = getAttachment(loadout[slot]);
      const open = this.openSlot === slot;
      const options = open ? `<div class="options">${attachmentsFor(this.weapon, slot).map(a =>
        `<button class="option${a.id === current?.id ? ' active' : ''}" data-slot="${slot}" data-att="${a.id}">
          <b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.description)}</small></button>`).join('')}</div>` : '';
      return `<div class="slot${open ? ' open' : ''}"><button class="slot-head" data-open="${slot}">
        <span>${SLOT_NAMES[slot]}</span><b>${escapeHtml(current?.name ?? '')}</b></button>${options}</div>`;
    }).join('');
    $('armorySlots').querySelectorAll<HTMLButtonElement>('[data-open]').forEach(b => b.addEventListener('click', () => {
      const slot = b.dataset.open as Slot;
      this.openSlot = this.openSlot === slot ? null : slot;
      this.render();
    }));
    $('armorySlots').querySelectorAll<HTMLButtonElement>('[data-att]').forEach(b => b.addEventListener('click', () => {
      loadouts.set(this.weapon, b.dataset.slot as Slot, b.dataset.att!);
      this.game.audio.beep(1100, 0.05, 'triangle', 0.05);
      if (this.game.state !== 'menu' && this.game.weapons.id === this.weapon) this.game.weapons.refreshLoadout();
      this.render();
    }));
  }
}
