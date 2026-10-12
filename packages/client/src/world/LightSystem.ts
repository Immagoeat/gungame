import * as THREE from 'three';
import type { PropDef } from '@gungame/shared';

type LightProp = Extract<PropDef, { kind: 'light' }>;

/** A light you can see and shoot: the light itself plus the glowing parts of its fixture. */
export interface LightFixture {
  light: THREE.PointLight;
  baseIntensity: number;
  nightOnly: boolean;
  /** Emissive materials that glow while the light is on. */
  glow: THREE.MeshStandardMaterial[];
  hitboxes: THREE.Mesh[];
  state: 'on' | 'dying' | 'off';
  /** Time left in the dying flicker. */
  dyingTime: number;
  flickerTimer: number;
  lit: boolean;
}

const DYING_SECONDS = 0.9;
/** Indoor lights are authored bright; this tones the whole house down. Night-only lamps are left as they are. */
const INDOOR_SCALE = 0.5;
/** Glow of lamp shades and bulbs (kept modest so they don't bloom into white blobs). */
const GLOW = 1.3;
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
const brass = new THREE.MeshStandardMaterial({ color: 0xd4a94d, metalness: 1, roughness: 0.25 });

/**
 * All map lights. Ceiling lights and chandeliers are shootable: a hit makes them flicker and die,
 * leaving the room darker. Night-only lights fade in as the sun goes down.
 */
export class LightSystem {
  readonly fixtures: LightFixture[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly root: THREE.Group, props: readonly PropDef[]) {
    for (const p of props) {
      if (p.kind === 'light') this.addLight(p);
      else if (p.kind === 'chandelier') this.addChandelier(p.x, p.y, p.z, p.castShadow ?? false);
    }
  }

  hitTargets(): THREE.Object3D[] {
    return this.fixtures.filter(f => f.state === 'on').flatMap(f => f.hitboxes);
  }

  fixtureFromObject(obj: THREE.Object3D): LightFixture | null {
    return (obj.userData.lightFixture as LightFixture | undefined) ?? null;
  }

  /** Breaks a fixture. Returns false if it was already out. */
  shoot(f: LightFixture): boolean {
    if (f.state !== 'on') return false;
    f.state = 'dying';
    f.dyingTime = DYING_SECONDS;
    return true;
  }

  /** @param night 0 = day, 1 = full night */
  update(dt: number, night: number): void {
    for (const f of this.fixtures) {
      if (f.state === 'dying') {
        f.dyingTime -= dt;
        f.flickerTimer -= dt;
        if (f.flickerTimer <= 0) {
          f.lit = !f.lit;
          f.flickerTimer = 0.03 + Math.random() * 0.12;
        }
        if (f.dyingTime <= 0) {
          f.state = 'off';
          f.lit = false;
        }
      }
      const level = f.state === 'off' ? 0 : f.state === 'dying' ? (f.lit ? 0.7 : 0.05) : 1;
      const timeOfDay = f.nightOnly ? THREE.MathUtils.smoothstep(night, 0.3, 0.8) : 1;
      f.light.intensity = f.baseIntensity * level * timeOfDay;
      for (const m of f.glow) m.emissiveIntensity = GLOW * level * (f.nightOnly ? timeOfDay : 1);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private register(light: THREE.PointLight, nightOnly: boolean, glow: THREE.MeshStandardMaterial[], hitboxes: THREE.Mesh[]): LightFixture {
    const f: LightFixture = {
      light, baseIntensity: light.intensity * (nightOnly ? 1 : INDOOR_SCALE), nightOnly, glow, hitboxes,
      state: 'on', dyingTime: 0, flickerTimer: 0, lit: true,
    };
    for (const h of hitboxes) h.userData.lightFixture = f;
    this.fixtures.push(f);
    return f;
  }

  private addLight(p: LightProp): void {
    const light = new THREE.PointLight(p.color, p.intensity, p.distance, 2);
    light.position.set(p.x, p.y, p.z);
    if (p.castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.002;
    }
    this.root.add(light);
    if (!p.fixture) {
      this.register(light, p.nightOnly ?? false, [], []);
      return;
    }
    // Semi-flush ceiling fixture: brass canopy and stem, frosted glass dome around the bulb.
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const glow = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: p.color, emissiveIntensity: 2.2, roughness: 0.4, transparent: true, opacity: 0.95 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glow);
    dome.rotation.x = Math.PI;
    dome.position.y = 0.32;
    dome.scale.y = 0.6;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 24), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.32;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), brass);
    stem.position.y = 0.6;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), brass);
    canopy.position.y = 0.85;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), hitMaterial);
    hit.position.y = 0.3;
    g.add(dome, rim, stem, canopy, hit);
    this.root.add(g);
    this.disposables.push(glow, dome.geometry, rim.geometry, stem.geometry, canopy.geometry, hit.geometry);
    this.register(light, p.nightOnly ?? false, [glow], [hit]);
  }

  private addChandelier(x: number, y: number, z: number, castShadow: boolean): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const crystal = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2, roughness: 0.05, metalness: 0.1 });
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), brass);
    chain.position.y = 0.6;
    g.add(chain);
    for (const [r, h, n] of [[1.1, 0, 14], [0.75, -0.45, 10], [0.4, -0.85, 6]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 32), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h;
      g.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), crystal);
        c.position.set(Math.cos(a) * r, h - 0.15, Math.sin(a) * r);
        g.add(c);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), crystal);
        candle.position.set(Math.cos(a) * r, h + 0.09, Math.sin(a) * r);
        g.add(candle);
      }
    }
    const light = new THREE.PointLight(0xffe8c0, 40, 22, 2);
    light.position.set(x, y - 0.5, z);
    if (castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002;
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), hitMaterial);
    hit.position.y = -0.4;
    hit.scale.y = 0.7;
    g.add(hit);
    this.root.add(g, light);
    this.disposables.push(crystal);
    this.register(light, false, [crystal], [hit]);
  }
}
