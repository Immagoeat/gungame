import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LOOK_OPTIONS, LOOK_SLOT_NAMES, LOOK_SLOTS, lookOption, type LookSlot } from '@gungame/shared';
import { characterLook } from '../core/characterLook';
import type { Game } from '../core/Game';
import { LAYER_CCTV_ONLY } from '../core/layers';
import { loadouts } from '../core/loadouts';
import { createAvatar, type Avatar, type AvatarState } from '../entities/avatar';
import { $, escapeHtml } from './dom';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Character customization: uniform, gear, face and hands, on a rotating live preview of the soldier. */
export class CharacterScreen {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 3 / 4, 0.05, 30);
  private readonly turntable = new THREE.Group();
  private avatar: Avatar | null = null;
  private running = false;
  private dragging = false;
  private lastX = 0;
  private openSlot: LookSlot | null = null;
  /** Close-up on the face, or the full body. */
  private zoom = 0;
  private zoomTarget = 0;
  private readonly clock = new THREE.Clock();
  private readonly state: AvatarState = {
    pos: new THREE.Vector3(), yaw: 0, pitch: 0, stance: 'stand', eyeHeight: 1.6, speed: 0, forward: 0,
    swimming: false, onGround: true, aiming: false,
    // Rifle held at the low ready.
    gunOffset: new THREE.Vector3(0.12, -0.42, -0.3), gunRotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.75, 0.25, 0)),
  };

  constructor(private readonly game: Game) {
    this.scene.add(this.turntable);
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(2, 3, 3);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.6);
    rim.position.set(-2.5, 2, -2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, 1, 2);
    this.scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.25));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.6, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.camera.layers.enable(LAYER_CCTV_ONLY);

    const canvas = $<HTMLCanvasElement>('charCanvas');
    canvas.addEventListener('pointerdown', e => { this.dragging = true; this.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.turntable.rotation.y += (e.clientX - this.lastX) * 0.01;
      this.lastX = e.clientX;
    });
    canvas.addEventListener('wheel', e => { this.zoomTarget = e.deltaY < 0 ? 1 : 0; }, { passive: true });
    $('charZoom').addEventListener('click', () => { this.zoomTarget = this.zoomTarget ? 0 : 1; });
  }

  open(): void {
    if (!this.renderer) {
      const canvas = $<HTMLCanvasElement>('charCanvas');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    }
    this.rebuild();
    this.render();
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.resize();
      if (!this.dragging) this.turntable.rotation.y += dt * 0.35;
      this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-6 * dt));
      this.camera.position.set(0, THREE.MathUtils.lerp(1.05, 1.5, this.zoom), THREE.MathUtils.lerp(5.2, 1.15, this.zoom));
      this.camera.lookAt(0, THREE.MathUtils.lerp(0.95, 1.47, this.zoom), 0);
      this.avatar?.update(dt, this.state);
      this.renderer!.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
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

  /** A fresh soldier in the current look, holding the rifle. */
  private rebuild(): void {
    if (this.avatar) this.turntable.remove(this.avatar.group);
    this.avatar = createAvatar(characterLook.get());
    this.avatar.setWeapon('rifle', loadouts.get('rifle'));
    this.turntable.add(this.avatar.group);
  }

  private render(): void {
    const look = characterLook.get();
    $('charSlots').innerHTML = LOOK_SLOTS.map(slot => {
      const current = lookOption(slot, look[slot]);
      const open = this.openSlot === slot;
      const swatch = (colors?: number[]) => colors
        ? `<span class="swatch" style="background:${colors.length > 1 ? `linear-gradient(135deg,${colors.map(hex).join(',')})` : hex(colors[0])}"></span>` : '';
      const options = open ? `<div class="options grid">${LOOK_OPTIONS[slot].map(o =>
        `<button class="option${o.id === current.id ? ' active' : ''}" data-slot="${slot}" data-look="${o.id}">${swatch(o.colors)}<b>${escapeHtml(o.name)}</b></button>`).join('')}</div>` : '';
      return `<div class="slot${open ? ' open' : ''}"><button class="slot-head" data-open="${slot}">
        <span>${LOOK_SLOT_NAMES[slot]}</span><b>${swatch(current.colors)}${escapeHtml(current.name)}</b></button>${options}</div>`;
    }).join('');
    $('charSlots').querySelectorAll<HTMLButtonElement>('[data-open]').forEach(b => b.addEventListener('click', () => {
      const slot = b.dataset.open as LookSlot;
      this.openSlot = this.openSlot === slot ? null : slot;
      // Face options are easier to judge up close.
      this.zoomTarget = this.openSlot && ['skin', 'face', 'hair', 'headgear'].includes(this.openSlot) ? 1 : 0;
      this.render();
    }));
    $('charSlots').querySelectorAll<HTMLButtonElement>('[data-look]').forEach(b => b.addEventListener('click', () => {
      characterLook.set(b.dataset.slot as LookSlot, b.dataset.look!);
      this.game.audio.beep(1100, 0.05, 'triangle', 0.05);
      this.rebuild();
      this.game.onLookChanged();
      this.render();
    }));
  }
}
