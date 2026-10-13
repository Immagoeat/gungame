import * as THREE from 'three';
import type { PropDef } from '@gungame/shared';

type CameraDef = Extract<PropDef, { kind: 'securityCamera' }>;
type MonitorDef = Extract<PropDef, { kind: 'monitorBank' }>;

import { LAYER_CCTV_ONLY, LAYER_EFFECTS, LAYER_SCREENS } from '../core/layers';

export { LAYER_CCTV_ONLY, LAYER_SCREENS };

const FEED_W = 256;
const FEED_H = 160;
const SCREEN_W = 0.9;
const SCREEN_H = 0.56;
const GAP = 0.06;
const CYCLE_SECONDS = 5;
const FEEDS_PER_FRAME = 2;
const VIEW_DISTANCE = 22;
const SWEEP_PERIOD = 9;

export interface SecurityCam {
  def: CameraDef;
  pivot: THREE.Group;
  /** The tilting head: housing, lens, LED and the feed camera. Falls off when shot. */
  head: THREE.Group;
  hitboxes: THREE.Mesh[];
  view: THREE.PerspectiveCamera;
  led: THREE.Mesh;
  phase: number;
  destroyed: boolean;
}

interface Screen {
  target: THREE.WebGLRenderTarget;
  material: THREE.MeshBasicMaterial;
  label: THREE.CanvasTexture;
  labelCtx: CanvasRenderingContext2D;
  slot: number;
  camIndex: number;
}

const housingGeo = new THREE.BoxGeometry(0.16, 0.14, 0.38);
const hoodGeo = new THREE.BoxGeometry(0.2, 0.03, 0.44);
const lensGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12);
const ledGeo = new THREE.SphereGeometry(0.018, 8, 6);
const armGeo = new THREE.BoxGeometry(0.05, 0.05, 0.3);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.4, metalness: 0.2 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.3, metalness: 0.5 });
const ledOn = new THREE.MeshBasicMaterial({ color: 0xff2020 });

/** Security cameras that pan, blink and feed live video to monitor banks. */
export class SecuritySystem {
  readonly cams: SecurityCam[] = [];
  /** Feeds looped from the security terminal: the cameras see nothing. */
  looped = false;
  /** Cameras that see nothing (taken over by someone friendly). */
  readonly ignored = new Set<string>();
  private readonly screens: Screen[] = [];
  private readonly banks: THREE.Vector3[] = [];
  private time = 0;
  private cycle = 0;
  private cycleTimer = CYCLE_SECONDS;
  private cursor = 0;
  private readonly staticCanvas = document.createElement('canvas');
  private readonly staticTexture: THREE.CanvasTexture;
  private staticTimer = 0;

  constructor(private readonly root: THREE.Group, props: readonly PropDef[]) {
    this.staticCanvas.width = 128;
    this.staticCanvas.height = 80;
    this.staticTexture = new THREE.CanvasTexture(this.staticCanvas);
    this.drawStatic();
    for (const p of props) {
      if (p.kind === 'securityCamera') this.addCamera(p);
    }
    for (const p of props) {
      if (p.kind === 'monitorBank') this.addMonitorBank(p);
    }
  }

  get cameraCount(): number {
    return this.cams.length;
  }

  /** Meshes bullets can hit, for cameras that still work. */
  hitTargets(): THREE.Object3D[] {
    return this.cams.filter(c => !c.destroyed).flatMap(c => c.hitboxes);
  }

  cameraFromObject(obj: THREE.Object3D): SecurityCam | null {
    return (obj.userData.securityCam as SecurityCam | undefined) ?? null;
  }

  /**
   * Knocks the camera out. Returns its head (still in the scene) so the caller can let it fall;
   * returns null if it was already destroyed. Monitors showing it switch to static.
   */
  destroy(cam: SecurityCam): THREE.Group | null {
    if (cam.destroyed) return null;
    cam.destroyed = true;
    cam.led.visible = false;
    for (const s of this.screens) if (s.camIndex === this.cams.indexOf(cam)) this.assign(s, s.camIndex);
    return cam.head;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.screens.some(s => this.cams[s.camIndex]?.destroyed)) {
      this.staticTimer -= dt;
      if (this.staticTimer <= 0) {
        this.staticTimer = 0.07;
        this.drawStatic();
      }
    }
    for (const c of this.cams) {
      if (c.destroyed) continue;
      c.pivot.rotation.y = c.def.yaw + Math.sin(this.time * (Math.PI * 2 / SWEEP_PERIOD) + c.phase) * c.def.sweep;
      c.led.visible = Math.floor(this.time + c.phase) % 2 === 0;
    }
    if (!this.screens.length || this.cams.length <= this.screens.length) return;
    this.cycleTimer -= dt;
    if (this.cycleTimer <= 0) {
      this.cycleTimer = CYCLE_SECONDS;
      this.cycle++;
      for (const s of this.screens) this.assign(s, (s.slot + this.cycle * this.screens.length) % this.cams.length);
    }
  }

  /** Renders a couple of feeds per frame, only while someone is near a monitor bank. */
  renderFeeds(renderer: THREE.WebGLRenderer, scene: THREE.Scene, viewer: THREE.Vector3): void {
    if (!this.screens.length || !this.banks.some(b => b.distanceTo(viewer) < VIEW_DISTANCE)) return;
    const prevTarget = renderer.getRenderTarget();
    const prevShadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // reuse this frame's shadow map
    for (let i = 0; i < Math.min(FEEDS_PER_FRAME, this.screens.length); i++) {
      const s = this.screens[this.cursor++ % this.screens.length];
      const cam = this.cams[s.camIndex];
      if (cam.destroyed) continue;
      cam.view.updateMatrixWorld();
      renderer.setRenderTarget(s.target);
      renderer.clear();
      renderer.render(scene, cam.view);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadows;
  }

  dispose(): void {
    for (const s of this.screens) {
      s.target.dispose();
      s.label.dispose();
      s.material.dispose();
    }
    this.staticTexture.dispose();
  }

  private drawStatic(): void {
    const g = this.staticCanvas.getContext('2d')!;
    const img = g.createImageData(this.staticCanvas.width, this.staticCanvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 200;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.staticTexture.needsUpdate = true;
  }

  private addCamera(def: CameraDef): void {
    const pivot = new THREE.Group();
    pivot.position.set(def.x, def.y, def.z);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = def.yaw;

    // Bracket reaching back to the wall, then a tilted head.
    const arm = new THREE.Mesh(armGeo, darkMat);
    arm.position.set(0, 0.05, 0.15);
    pivot.add(arm);
    const head = new THREE.Group();
    head.rotation.x = def.pitch;
    pivot.add(head);
    const housing = new THREE.Mesh(housingGeo, bodyMat);
    housing.position.z = -0.12;
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.085, -0.14);
    const lens = new THREE.Mesh(lensGeo, darkMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.32;
    const led = new THREE.Mesh(ledGeo, ledOn);
    led.position.set(0.05, 0.04, -0.31);
    for (const m of [arm, housing, hood, lens]) m.castShadow = true;
    head.add(housing, hood, lens, led);
    const hitboxes = [housing, hood, lens];

    const view = new THREE.PerspectiveCamera(72, FEED_W / FEED_H, 0.1, 120);
    view.position.z = -0.35;
    view.layers.enable(LAYER_CCTV_ONLY);
    view.layers.enable(LAYER_EFFECTS);
    head.add(view);

    this.root.add(pivot);
    const cam: SecurityCam = { def, pivot, head, hitboxes, view, led, phase: this.cams.length * 1.7, destroyed: false };
    for (const h of hitboxes) h.userData.securityCam = cam;
    this.cams.push(cam);
  }

  private addMonitorBank(def: MonitorDef): void {
    const bank = new THREE.Group();
    bank.position.set(def.x, def.y, def.z);
    bank.rotation.y = def.yaw;
    const w = def.cols * (SCREEN_W + GAP) + GAP;
    const h = def.rows * (SCREEN_H + GAP) + GAP;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), darkMat);
    frame.position.z = 0.04;
    bank.add(frame);

    for (let r = 0; r < def.rows; r++) {
      for (let c = 0; c < def.cols; c++) {
        const target = new THREE.WebGLRenderTarget(FEED_W, FEED_H, { colorSpace: THREE.SRGBColorSpace });
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 160;
        const labelCtx = canvas.getContext('2d')!;
        const label = new THREE.CanvasTexture(canvas);
        label.colorSpace = THREE.SRGBColorSpace;

        const x = -w / 2 + GAP + SCREEN_W / 2 + c * (SCREEN_W + GAP);
        const y = h / 2 - GAP - SCREEN_H / 2 - r * (SCREEN_H + GAP);
        const material = new THREE.MeshBasicMaterial({ map: target.texture });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), material);
        screen.position.set(x, y, -0.005);
        screen.rotation.y = Math.PI; // planes face +z; the bank's front is -z
        const overlay = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
          new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false }));
        overlay.position.set(x, y, -0.008);
        overlay.rotation.y = Math.PI;
        screen.layers.set(LAYER_SCREENS);
        overlay.layers.set(LAYER_SCREENS);
        bank.add(screen, overlay);

        const s: Screen = { target, material, label, labelCtx, slot: this.screens.length, camIndex: 0 };
        this.screens.push(s);
      }
    }
    for (const s of this.screens) this.assign(s, s.slot % Math.max(1, this.cams.length));
    this.root.add(bank);
    this.banks.push(bank.position.clone());
  }

  private assign(s: Screen, camIndex: number): void {
    s.camIndex = camIndex;
    const g = s.labelCtx;
    const cam = this.cams[camIndex];
    g.clearRect(0, 0, 256, 160);
    if (!cam) return;
    const map = cam.destroyed ? this.staticTexture : s.target.texture;
    if (s.material.map !== map) {
      s.material.map = map;
      s.material.needsUpdate = true;
    }
    const title = `CAM ${String(camIndex + 1).padStart(2, '0')} ${cam.def.label.toUpperCase()}`;
    g.font = 'bold 15px monospace';
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(6, 6, g.measureText(title).width + 12, 22);
    g.fillStyle = '#e8ffe8';
    g.fillText(title, 12, 22);
    if (cam.destroyed) {
      g.font = 'bold 26px monospace';
      const msg = 'SIGNAL LOST';
      const w = g.measureText(msg).width;
      g.fillStyle = 'rgba(0,0,0,.7)';
      g.fillRect(128 - w / 2 - 10, 62, w + 20, 38);
      g.fillStyle = '#ff4040';
      g.fillText(msg, 128 - w / 2, 90);
    } else {
      g.fillStyle = '#ff3030';
      g.beginPath();
      g.arc(240, 18, 6, 0, Math.PI * 2);
      g.fill();
    }
    s.label.needsUpdate = true;
  }
}
